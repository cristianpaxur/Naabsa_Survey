/**
 * Smoke test do builder MSC: gera um working.docx usando dados FICTÍCIOS
 * (não bate no banco), converte para PDF via LibreOffice e verifica tamanho.
 *
 * Uso: tsx apps/worker/src/smoke-build-msc.ts
 */
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runExtraction, validateSpec } from '@naabsa/core';
import { buildReportDocxMsc, type DocxInputMsc, type TimeLogRow } from './lib/buildDocxMsc';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const specPath = resolve(ROOT, '../tests/fixtures/specs/msc.v1.json');
const xlsxPath = resolve(ROOT, '../tests/fixtures/planilhas/msc/msc.real.v1.xlsx');
const outDir = resolve(__dirname, '../../tmp');

async function main() {
  const raw = JSON.parse(readFileSync(specPath, 'utf-8'));
  const r = validateSpec(raw);
  if (!r.valid) { console.error('SPEC INVALID:', r.errors); process.exit(1); }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ext = runExtraction(wb, r.spec, null);
  if (ext.issues.some((i) => i.level === 'error' && i.origin === 'extraction')) {
    console.error('Extração com erro bloqueante:');
    for (const i of ext.issues) console.error(' ', i.level, i.field, '|', i.message);
    process.exit(1);
  }

  // Foto placeholder 800x600 (cinza). Se não houver fotos reais, o builder
  // ainda funciona e gera as 3 seções de Photographic Report vazias.
  const fakePhoto = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).png().toBuffer();

  // Logo NAABSA (se existir) ou null.
  const logoPath = resolve(__dirname, 'assets/naabsa-logo.jpg');
  const logo = existsSync(logoPath) ? readFileSync(logoPath) : null;

  // Lê Time Log direto da planilha (mesma lógica do generatePdf).
  const tlWs = wb.getWorksheet('Time Log');
  const timeLogRows: TimeLogRow[] = [];
  if (tlWs) {
    for (let r = 5; r <= 16; r++) {
      const event = String(tlWs.getCell(r, 2).value ?? '').trim();
      if (!event) continue;
      const dateRaw = tlWs.getCell(r, 6).value;
      const startRaw = tlWs.getCell(r, 7).value;
      const flag = String(tlWs.getCell(r, 8).value ?? '').trim();
      const endRaw = tlWs.getCell(r, 9).value;
      const date = dateRaw instanceof Date
        ? `${dateRaw.getUTCFullYear()}-${String(dateRaw.getUTCMonth() + 1).padStart(2, '0')}-${String(dateRaw.getUTCDate()).padStart(2, '0')}`
        : (dateRaw == null ? null : String(dateRaw));
      const start = startRaw instanceof Date
        ? `${String(startRaw.getUTCHours()).padStart(2, '0')}:${String(startRaw.getUTCMinutes()).padStart(2, '0')}`
        : (startRaw == null ? null : String(startRaw));
      const end = endRaw instanceof Date
        ? `${String(endRaw.getUTCHours()).padStart(2, '0')}:${String(endRaw.getUTCMinutes()).padStart(2, '0')}`
        : (endRaw == null ? null : String(endRaw));
      timeLogRows.push({ event, date, start, flag, end });
    }
  }

  const input: DocxInputMsc = {
    data: ext.data,
    logo,
    photos: {
      vessel: [fakePhoto],
      engine_room: [fakePhoto],
      survey_attendance: [fakePhoto],
    },
    timeLogRows,
  };

  console.log('[smoke] gerando working.docx (1o passe)...');
  const pass1 = await buildReportDocxMsc(input);
  console.log('[smoke] pass1 size:', pass1.length, 'B');

  // 2o passe: medir bookmarks e gerar sumario com numeros reais.
  const { measureBookmarkPages, convertDocxToPdf } = await import('./lib/soffice');
  const pages = await measureBookmarkPages(pass1);
  console.log('[smoke] paginas medidas:', pages);

  console.log('[smoke] gerando working.docx (2o passe)...');
  const docx = await buildReportDocxMsc({ ...input, tocPages: pages });
  console.log('[smoke] docx final size:', docx.length, 'B');

  // Persistir o .docx e o .pdf em /tmp para inspecao manual.
  if (!existsSync(outDir)) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(outDir, { recursive: true });
  }
  const docxOut = resolve(outDir, 'msc-smoke.docx');
  writeFileSync(docxOut, docx);
  console.log('[smoke] docx escrito em', docxOut);

  console.log('[smoke] convertendo para PDF...');
  const pdf = await convertDocxToPdf(docx);
  const pdfOut = resolve(outDir, 'msc-smoke.pdf');
  writeFileSync(pdfOut, pdf);
  console.log('[smoke] pdf escrito em', pdfOut, '(', pdf.length, 'B )');
}

main().catch((err: unknown) => {
  console.error('[smoke] falha:', err);
  process.exit(1);
});
