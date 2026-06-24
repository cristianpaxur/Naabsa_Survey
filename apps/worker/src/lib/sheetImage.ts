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
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import sharp from 'sharp';

function findSoffice(): string {
  const fromEnv = process.env.SOFFICE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.com',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'soffice'; // PATH (container Linux)
}

function runSoffice(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(findSoffice(), args);
    let stderr = '';
    proc.stdout.on('data', (d) => (stderr += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`soffice saiu com ${code}: ${stderr.slice(0, 300)}`)),
    );
  });
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
  try {
    const dim = target.dimensions as unknown as { tl?: string; br?: string };
    if (dim?.tl && dim?.br) {
      target.pageSetup = { ...target.pageSetup, printArea: `${dim.tl}:${dim.br}` };
    }
  } catch {
    /* sem print area definida — segue */
  }

  const dir = await mkdtemp(join(tmpdir(), 'naabsa-sheet-'));
  try {
    const inPath = join(dir, 'in.xlsx');
    await wb.xlsx.writeFile(inPath);
    const profile = 'file:///' + join(dir, 'lo_profile').replace(/\\/g, '/');
    await runSoffice([
      '--headless', '--calc', '--nologo', '--norestore',
      `-env:UserInstallation=${profile}`,
      '--convert-to', 'png', '--outdir', dir, inPath,
    ]);

    const outPath = join(dir, 'in.png');
    if (!existsSync(outPath)) throw new Error('LibreOffice não gerou o PNG.');
    const raw = await readFile(outPath);

    // Recorta as bordas brancas (a aba ocupa só parte da página exportada).
    return await sharp(raw)
      .trim({ threshold: 10 })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
