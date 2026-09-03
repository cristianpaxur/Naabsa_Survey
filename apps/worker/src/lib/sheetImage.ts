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
 * Detecta linhas com conteúdo (cor saturada azul/rosa) e para no primeiro GAP
 * grande de linhas brancas (GAP=80) — assim ignora bordas brancas e blocos
 * secundários abaixo do conteúdo principal.
 */
async function cropToColoredContent(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const GAP = 80; // px de linhas vazias que encerram o bloco
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

  // Reordena: põe a aba alvo em primeiro lugar via `orderNo`. O LibreOffice
  // `--convert-to png` renderiza a PRIMEIRA aba do workbook (ignora
  // `activeTab` e respeita mal `state="hidden"`). `splice/unshift` na
  // `wb.worksheets` não persiste no XML — só `orderNo` funciona.
  for (const ws of wb.worksheets) {
    (ws as unknown as { orderNo?: number }).orderNo = ws.name === sheetName ? 1 : 99;
  }

  // Só a aba alvo visível (as demais ocultas continuam resolvendo fórmulas).
  for (const ws of wb.worksheets) {
    ws.state = ws.name === sheetName ? 'visible' : 'hidden';
  }
  // Gridlines ativas: o print do Excel mostra a grade cinza-fina entre as
  // células, que é o estilo "spreadsheet" usado na capa do relatório.
  // O `showGridLines: true` (default) deixa a grade visível; o template tem
  // cores de fundo (azul/rosa/branco) que continuam delimitando os blocos.
  target.views = (target.views?.length ? target.views : [{}]).map(
    (v) => ({ ...v, showGridLines: true }) as never,
  );

  // Remove bordas CUSTOMIZADAS das células: o template define bordas pretas
  // grossas em todas as células, o que sobrepõe as gridlines finas. Mantendo
  // só as gridlines (cinza-claro) e os fills coloridos, o print fica
  // parecido com a visualização normal do Excel.
  for (let r = 1; r <= target.rowCount; r++) {
    const row = target.getRow(r);
    for (let c = 1; c <= target.columnCount; c++) {
      const cell = row.getCell(c);
      const none = 'none' as unknown as never;
      cell.border = {
        top: { style: none },
        left: { style: none },
        bottom: { style: none },
        right: { style: none },
        diagonal: { style: none },
      };
    }
  }

  // A aba de cálculo tem 4 blocos lado a lado (Draft Survey, Displacement,
  // Ballast Water, Fresh Water/Bunker). Renderiza em paisagem com
  // fitToWidth=1 para caber todos os blocos na mesma página.
  //
  // Limites: o printArea vai de B2 até a última coluna/linha USADAS pela aba
  // (incluindo linhas só com formatação). O `cropToColoredContent` depois
  // recorta para o bloco de tabelas empilhadas (Draft Marks + Displacement +
  // Ballast Water) parando no primeiro gap visual.
  const dim = target.dimensions as { right?: number; bottom?: number } | undefined;
  const lastCol = colLetter(Math.max(dim?.right ?? 28, target.columnCount));
  const lastRow = Math.max(dim?.bottom ?? 60, target.rowCount);
  target.pageSetup = {
    ...target.pageSetup,
    printArea: `B2:${lastCol}${lastRow}`,
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
    // impresso é a região colorida — abaixo dela é branco. O `cropToColoredContent`
    // usa GAP=80 entre linhas para detectar o fim do bloco — ele para no
    // primeiro gap visual grande entre tabelas ou no fim do conteúdo.
    //
    // NOTA: NÃO usar sharp.trim() — ele remove os gaps brancos entre tabelas
    // (cortando conteúdo do meio). O extract do crop já remove as bordas externas.
    const cropped = await cropToColoredContent(raw);
    return await sharp(cropped).png({ compressionLevel: 9 }).toBuffer();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
