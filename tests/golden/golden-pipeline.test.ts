/** Golden de conteúdo OOXML. Comparação raster de PDF é um aceite separado. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import PizZip from '../../apps/worker/node_modules/pizzip';
import { runExtraction } from '../../packages/core/src/extractor';
import type { ReportSpec } from '../../packages/core/src/types';
import { buildReportDocx } from '../../apps/worker/src/lib/buildDocx';
import { buildReportDocxMsc } from '../../apps/worker/src/lib/buildDocxMsc';

async function extracted(slug: string, variant: string | null) {
  const spec = JSON.parse(readFileSync(new URL(`../fixtures/specs/${slug}.v1.json`, import.meta.url), 'utf8')) as ReportSpec;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fileURLToPath(new URL(`../fixtures/planilhas/${slug}/${slug}.real.v1.xlsx`, import.meta.url)));
  return runExtraction(workbook, spec, variant);
}

function paragraphs(zip: PizZip) {
  const xml = zip.file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(p =>
    [...p[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('')).filter(Boolean);
}

describe('Golden DOCX — planilhas reais e builders atuais', () => {
  it.each(['loading', 'discharge'] as const)('Draft Survey %s preserva dados, seções e imagens', async (variant) => {
    const result = await extracted('draft_survey', variant);
    const photo = await sharp({create:{width:16,height:12,channels:3,background:'#456789'}}).jpeg().toBuffer();
    const input = { data: {...result.data, port: 'São Luís — ação', vessel_name: 'MV GOLDEN'}, variant,
      logo:null, sheetImages:{}, phasePhotos:{initial:[photo],final:[photo]}, acting:{} };
    const zip = new PizZip(await buildReportDocx(input));
    const text = paragraphs(zip);
    expect(text.join('\n')).toContain('MV GOLDEN');
    expect(text.join('\n')).toContain('São Luís — ação');
    expect(text.join('\n')).toContain('Photographic Report');
    expect(text).toMatchSnapshot(`Draft Survey ${variant}: conteúdo`);
    expect(Object.keys(zip.files).filter(k=>/^word\/media\/.*\.jpg$/.test(k))).not.toHaveLength(0);
    expect(zip.file('word/document.xml')!.asText()).toContain('<w:pgSz');
    expect(paragraphs(new PizZip(await buildReportDocx(input)))).toEqual(text);
  });
  it('MSC usa dados reais e gera documento próprio', async () => {
    const result = await extracted('msc', null);
    const zip = new PizZip(await buildReportDocxMsc({ data: {...result.data,vessel_name:'MSC GOLDEN'}, logo:null, photos:{}, timeLogRows:[] }));
    const text = paragraphs(zip);
    expect(text.join('\n')).toContain('MSC GOLDEN');
    expect(text).toMatchSnapshot('MSC: conteúdo');
    expect(zip.file('[Content_Types].xml')!.asText()).toContain('wordprocessingml.document.main');
  });
});
