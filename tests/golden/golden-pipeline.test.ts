/** Golden de conteúdo + contrato estrutural do layout Word aprovado. */
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
  const spec = JSON.parse(
    readFileSync(
      new URL(`../fixtures/specs/${slug}.v1.json`, import.meta.url),
      'utf8',
    ),
  ) as ReportSpec;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(
    fileURLToPath(
      new URL(
        `../fixtures/planilhas/${slug}/${slug}.real.v1.xlsx`,
        import.meta.url,
      ),
    ),
  );
  return runExtraction(workbook, spec, variant);
}

function paragraphs(zip: PizZip) {
  const xml = zip.file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) =>
      [...p[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join(''),
    )
    .filter(Boolean);
}

describe('Golden DOCX — planilhas reais e builders atuais', () => {
  it('extrai horários das abas de origem quando os espelhos da Capa não têm cache', async () => {
    const spec = JSON.parse(
      readFileSync(
        new URL('../fixtures/specs/draft_survey.v1.json', import.meta.url),
        'utf8',
      ),
    ) as ReportSpec;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      fileURLToPath(
        new URL(
          '../fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx',
          import.meta.url,
        ),
      ),
    );
    for (const cell of ['M7', 'N7', 'M8', 'N8', 'M9', 'N9']) {
      workbook.getWorksheet('Capa')!.getCell(cell).value = null;
    }
    const result = runExtraction(workbook, spec, 'loading');
    expect(result.data['initial_start']).toBe('07:55');
    expect(result.data['initial_end']).toBe('10:00');
    expect(result.data['intermediate_start']).toBe('17:20');
    expect(result.data['intermediate_end']).toBe('19:00');
    expect(result.data['final_start']).toBe('14:30');
    expect(result.data['final_end']).toBe('16:00');
  });

  it.each(['loading', 'discharge'] as const)(
    'Draft Survey %s preserva dados, seções e imagens',
    async (variant) => {
      const result = await extracted('draft_survey', variant);
      const photo = await sharp({
        create: { width: 16, height: 12, channels: 3, background: '#456789' },
      })
        .jpeg()
        .toBuffer();
      const input = {
        data: {
          ...result.data,
          port: 'São Luís — ação',
          vessel_name: 'MV GOLDEN',
        },
        variant,
        logo: null,
        sheetImages: {},
        phasePhotos: { initial: [photo], final: [photo] },
        acting: {},
      };
      const zip = new PizZip(await buildReportDocx(input));
      const source = new PizZip(
        readFileSync(
          new URL(
            '../fixtures/reports/draft_survey/MV-PERSEUS-I.model.docx',
            import.meta.url,
          ),
        ),
      );
      const documentXml = zip.file('word/document.xml')!.asText();
      const sourceDocumentXml = source.file('word/document.xml')!.asText();
      const text = paragraphs(zip);
      expect(text.join('\n')).toContain('MV GOLDEN');
      expect(text.join('\n')).toContain('São Luís — ação');
      expect(text.join('\n')).toContain('Photographic Report');
      expect(text).toMatchSnapshot(`Draft Survey ${variant}: conteúdo`);
      expect(
        Object.keys(zip.files).filter((k) => /^word\/media\/.*\.jpg$/.test(k)),
      ).not.toHaveLength(0);
      expect(
        Object.keys(zip.files).filter((k) =>
          /^word\/media\/image_generated_\d+\.png$/.test(k),
        ),
      ).toHaveLength(6);
      expect(documentXml).toContain('<w:pgSz');
      expect(documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0]).toBe(
        sourceDocumentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0],
      );
      expect(documentXml.match(/<w:tbl>/g) ?? []).toHaveLength(6);
      expect(documentXml).not.toMatch(
        /<w:highlight\b|EE0000|00B050|E36C0A|F79646|00B0F0|FFC000/,
      );
      expect(documentXml).not.toMatch(/\{(?:%%?|#|\/)?[A-Za-z_][^{}]*\}/);
      expect(documentXml).not.toMatch(
        /Print da planilha|Neste item|autom[aá]tico|DSInt|DSFinal|Capa [A-Z]\d+/i,
      );
      expect(documentXml).toContain('w:name="s1"');
      expect(documentXml).toContain('w:name="s6"');
      expect(documentXml).toContain('<w:hyperlink w:anchor="s1"');
      expect(documentXml).toContain('<w:hyperlink w:anchor="s6"');
      expect(documentXml.match(/<w:pageBreakBefore\/>/g) ?? []).toHaveLength(1);
      for (const part of [
        'word/styles.xml',
        'word/numbering.xml',
        'word/header1.xml',
        'word/header2.xml',
        'word/footer1.xml',
      ]) {
        expect(zip.file(part)!.asText()).toBe(source.file(part)!.asText());
      }
      expect(paragraphs(new PizZip(await buildReportDocx(input)))).toEqual(
        text,
      );
    },
  );
  it('Draft Survey renumera as seções quando não há fase intermediária', async () => {
    const result = await extracted('draft_survey', 'loading');
    const zip = new PizZip(
      await buildReportDocx({
        data: { ...result.data, intermediate_date: null },
        variant: 'loading',
        logo: null,
        sheetImages: {},
        phasePhotos: {},
        acting: {},
      }),
    );
    const text = paragraphs(zip).join('\n');
    expect(text).not.toContain('Intermediate');
    expect(text).toContain('4.1. Draft Readings');
    expect(text).toContain('3.6. Photographic Report');
    expect(text).toContain('4.6. Photographic Report');
    expect(zip.file('word/document.xml')!.asText()).not.toContain(
      'w:name="s4"',
    );
  });

  it('remove Intermediate quando as abas intermediárias não existem na planilha', async () => {
    const spec = JSON.parse(
      readFileSync(
        new URL('../fixtures/specs/draft_survey.v1.json', import.meta.url),
        'utf8',
      ),
    ) as ReportSpec;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(
      fileURLToPath(
        new URL(
          '../fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx',
          import.meta.url,
        ),
      ),
    );
    workbook.removeWorksheet('Intermediario');
    workbook.removeWorksheet('DS INTERMEDIATE');

    const result = runExtraction(workbook, spec, 'loading');
    expect(result.issues).toHaveLength(0);
    expect(result.data['intermediate_date']).toBeNull();

    const zip = new PizZip(
      await buildReportDocx({
        data: result.data,
        variant: 'loading',
        logo: null,
        sheetImages: {},
        phasePhotos: {},
        acting: {},
      }),
    );
    const xml = zip.file('word/document.xml')!.asText();
    const text = paragraphs(zip).join('\n');
    expect(text).not.toContain('Intermediate');
    expect(text).toContain('4.1. Draft Readings');
    expect(text).toContain('4.6. Photographic Report');
    expect(xml).not.toContain('w:name="s4"');
  });

  it('MSC usa dados reais e gera documento próprio', async () => {
    const result = await extracted('msc', null);
    const zip = new PizZip(
      await buildReportDocxMsc({
        data: { ...result.data, vessel_name: 'MSC GOLDEN' },
        logo: null,
        photos: {},
        timeLogRows: [],
      }),
    );
    const text = paragraphs(zip);
    expect(text.join('\n')).toContain('MSC GOLDEN');
    expect(text).toEqual(
      expect.arrayContaining([
        '2. Background',
        '2.5 Gross volume — m³',
        '2.6 Sludge Disposal',
        '2.7 Sludge rate production',
        '2.8 Consumption x Flowmeter',
        '2.10 Time log',
        '3. Photographic report',
        '3.4 ECR (Engine Control Room)',
        '3.5 Hull',
        '4. Attachment',
        'Survey Report',
        'Berthing message',
        'VRS updated',
        'Last manual sounding',
        'Logbook update',
        'Sludge removal certificates',
      ]),
    );
    expect(text).not.toContain('4. Vessel');
    expect(zip.file('[Content_Types].xml')!.asText()).toContain(
      'wordprocessingml.document.main',
    );
  });
});
