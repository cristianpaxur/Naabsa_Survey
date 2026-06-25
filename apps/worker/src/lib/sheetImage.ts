/**
 * Renderiza uma aba de um .xlsx como PNG (pixel-perfeito) via LibreOffice
 * headless — reproduz o "print da planilha" do modelo Word.
 *
 * Estratégia: oculta as demais abas (mantém as fórmulas válidas), exporta a aba
 * alvo (única visível) para PNG, e recorta as bordas brancas com sharp.
 *
 * Requer LibreOffice instalado (Windows: soffice.com; Linux/container:
 * `libreoffice-calc` no PATH). Caminho configurável via SOFFICE_PATH.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { withLoLock, findSoffice } from './soffice';

/** Índice de coluna (1-based) → letra(s) A1 (1→A, 28→AB). */
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

/**
 * Recorta a imagem para o BLOCO principal de conteúdo (a tabela do template).
 * Detecta linhas com conteúdo (cor saturada azul/rosa OU pixel escuro de
 * texto/borda) e para no primeiro GAP grande de linhas brancas — assim ignora
 * células soltas (ex.: marcadores amarelos) muito abaixo da tabela impressa.
 */
async function cropToColoredContent(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const GAP = 50; // px de linhas vazias que encerram o bloco
  const M = 6; // margem

  const isContent = (i: number): boolean => {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx - mn > 35 && mx > 70; // só cor saturada (azul/rosa do template)
  };
  const rowHasContent = (y: number): boolean => {
    const base = y * width * channels;
    for (let x = 0; x < width; x++) if (isContent(base + x * channels)) return true;
    return false;
  };

  let top = -1;
  for (let y = 0; y < height; y++) {
    if (rowHasContent(y)) { top = y; break; }
  }
  if (top < 0) return png; // imagem vazia

  let bottom = top;
  let gap = 0;
  for (let y = top + 1; y < height; y++) {
    if (rowHasContent(y)) { bottom = y; gap = 0; }
    else if (++gap >= GAP) break;
  }

  // left/right só no bloco principal [top, bottom]
  let left = width;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    const base = y * width * channels;
    for (let x = 0; x < width; x++) {
      if (isContent(base + x * channels)) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return png;

  const cl = Math.max(0, left - M);
  const ct = Math.max(0, top - M);
  const cw = Math.min(width - cl, right - left + 1 + 2 * M);
  const ch = Math.min(height - ct, bottom - top + 1 + 2 * M);
  return sharp(png).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer();
}

/** Roda o soffice serializado pelo MESMO mutex de soffice.ts — evita 2 instâncias
 *  concorrentes (render_sheets/Calc + generate_pdf/Writer) que fazem o headless do
 *  Linux sair 0 sem gerar nada. HOME gravável: o LibreOffice toca o $HOME e, sem um
 *  gravável, também sai 0 sem produzir o PNG. Retorna a saída para diagnóstico. */
function runSoffice(args: string[], cwd: string): Promise<string> {
  return withLoLock(
    () =>
      new Promise<string>((resolve, reject) => {
        const proc = spawn(findSoffice(), args, {
          env: { ...process.env, HOME: cwd },
          windowsHide: process.platform === 'win32',
        });
        let out = '';
        proc.stdout.on('data', (d) => (out += d.toString()));
        proc.stderr.on('data', (d) => (out += d.toString()));
        proc.on('error', reject);
        proc.on('close', (code) =>
          code === 0
            ? resolve(out)
            : reject(new Error(`soffice saiu com ${code}: ${out.slice(0, 400)}`)),
        );
      }),
  );
}

/**
 * Converte a aba `sheetName` do workbook em PNG recortado. Lança se a aba não
 * existir ou se o LibreOffice falhar.
 */
export async function renderSheetPng(
  xlsxBuffer: Buffer,
  sheetName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuffer as unknown as ArrayBuffer);
  const target = wb.getWorksheet(sheetName);
  if (!target) throw new Error(`Aba '${sheetName}' não encontrada na planilha.`);

  // Só a aba alvo visível (as demais ocultas continuam resolvendo fórmulas).
  for (const ws of wb.worksheets) {
    ws.state = ws.name === sheetName ? 'visible' : 'hidden';
  }
  // Sem gridlines: o "mar" de células vazias abaixo do conteúdo sai branco.
  target.views = (target.views?.length ? target.views : [{}]).map(
    (v) => ({ ...v, showGridLines: false }) as never,
  );

  // A aba de cálculo tem 4 blocos lado a lado (Draft Survey, Displacement,
  // Ballast Water, Fresh Water/Bunker). O LibreOffice pagina a largura em várias
  // páginas e o export PNG só rende a 1ª — cortando os blocos da direita. Forçar
  // paisagem + "ajustar à largura" (fitToWidth=1) coloca TODAS as colunas em uma
  // página, então o PNG sai com os 4 blocos. A área é a extensão real de dados
  // (sobrescreve a print-area B:O do template, que esconde Ballast/Fresh).
  const dim = target.dimensions as { right?: number; bottom?: number } | undefined;
  const lastCol = colLetter(dim?.right ?? 28);
  target.pageSetup = {
    ...target.pageSetup,
    printArea: `B2:${lastCol}${dim?.bottom ?? 60}`,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    scale: undefined,
    margins: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1, header: 0, footer: 0 },
  } as never;

  const dir = await mkdtemp(join(tmpdir(), 'naabsa-sheet-'));
  try {
    const inPath = join(dir, 'in.xlsx');
    await wb.xlsx.writeFile(inPath);
    const profile = 'file:///' + join(dir, 'lo_profile').replace(/\\/g, '/');
    const out = await runSoffice([
      '--headless', '--calc', '--nologo', '--norestore',
      `-env:UserInstallation=${profile}`,
      '--convert-to', 'png', '--outdir', dir, inPath,
    ], dir);

    // O LibreOffice nomeia o PNG como in.png (ou in1.png se paginar) — varre por
    // qualquer .png. Se nada saiu, erra com a saída do soffice + os arquivos do dir.
    const files = await readdir(dir);
    const pngName = files.find((f) => f.toLowerCase().endsWith('.png'));
    if (!pngName) {
      throw new Error(
        `LibreOffice não gerou PNG (arquivos: ${files.join(', ') || 'nenhum'}). Saída: ${out.slice(0, 300)}`,
      );
    }
    const raw = await readFile(join(dir, pngName));

    // Recorta para o conteúdo COLORIDO (template azul/rosa) + margem, e remove
    // as bordas brancas. O LibreOffice exporta a página inteira; o conteúdo
    // impresso é a região colorida — abaixo dela é branco.
    const cropped = await cropToColoredContent(raw);
    return await sharp(cropped).trim({ threshold: 12 }).png({ compressionLevel: 9 }).toBuffer();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
