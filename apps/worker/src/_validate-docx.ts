import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { runExtraction, validateSpec } from '@naabsa/core';
import { renderSheetPng } from './lib/sheetImage';
import { buildReportDocx, type DocxInput } from './lib/buildDocx';
import { convertDocxToPdf, convertDocxFirstPagePng, measureBookmarkPages } from './lib/soffice';

const ROOT = 'C:/Apps/Naabsa_Survey';
const specRaw = JSON.parse(readFileSync(`${ROOT}/tests/fixtures/specs/draft_survey.v1.json`, 'utf-8'));
const sr = validateSpec(specRaw);
if (!sr.valid) throw new Error('spec inválido');
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(`${ROOT}/tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx`);
const { data, tables } = runExtraction(wb, sr.spec);
const buf = readFileSync(`${ROOT}/tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx`);
const toStr = (m: unknown): string[][] => Array.isArray(m) ? (m as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c)))) : [];

const base: DocxInput = {
  data, variant: 'loading',
  logo: readFileSync(`${ROOT}/apps/web/public/naabsa-logo.jpg`),
  coverPhoto: null,
  sheetImages: {
    initial: await renderSheetPng(buf, 'Inicial'),
    intermediate: await renderSheetPng(buf, 'Intermediario'),
    final: await renderSheetPng(buf, 'final'),
  },
  phasePhotos: {},
  acting: { intermediate: toStr(tables['int_figures_acting_as']), final: toStr(tables['fin_figures_acting_as']) },
};

// passe 1: sem números → mede páginas dos bookmarks
const pass1 = await buildReportDocx(base);
const pages = await measureBookmarkPages(pass1);
console.log('páginas medidas:', Object.entries(pages).map(([k, p]) => `${k}=${p}`).join(', '));

// passe 2: monta o sumário com os números reais
const pass2 = await buildReportDocx({ ...base, tocPages: pages });
writeFileSync(`${ROOT}/.tmp_report.docx`, pass2);
writeFileSync(`${ROOT}/.tmp_report.pdf`, await convertDocxToPdf(pass2));
writeFileSync(`${ROOT}/.tmp_report.png`, await convertDocxFirstPagePng(pass2));
console.log('docx + pdf + png (capa) gerados');
