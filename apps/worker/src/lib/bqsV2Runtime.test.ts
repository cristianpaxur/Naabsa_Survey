import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { runExtraction, type ReportSpec } from '@naabsa/core';
import {
  readBqsTimeLog,
  auditBqsCalculations,
  type DocxInputBqs,
} from './buildDocxBqs';
let input: DocxInputBqs, wb: ExcelJS.Workbook;
beforeAll(async () => {
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/bqs/synthetic-v2.xlsx',
        import.meta.url,
      ),
    ) as never,
  );
  const spec = JSON.parse(
    readFileSync(
      new URL('../../../../tests/fixtures/specs/bqs.v2.json', import.meta.url),
      'utf8',
    ),
  ) as ReportSpec;
  const e = runExtraction(wb, spec);
  input = {
    templateVersion: 2,
    data: e.data,
    tables: e.tables,
    photos: {},
    timeLogRows: [],
  };
});
describe('BQS v2 runtime', () => {
  it('reconcilia percentual sobre recebido e sinal logbook menos abertura', () => {
    expect(auditBqsCalculations(input)).toEqual([]);
    const d = {
      ...input.data,
      delivery_difference_pct:
        ((input.data.delivery_difference as number) /
          (input.data.bdn_quantity as number)) *
        100,
    };
    expect(auditBqsCalculations({ ...input, data: d })).toContain(
      'delivery_difference_pct: total inconsistente',
    );
  });
  it('lê os novos rótulos e preserva override na narrativa e no time log', () => {
    const d = {
      ...input.data,
      arrival_start: '15:47',
      vessel_open_start: '16:17',
    };
    const rows = readBqsTimeLog(wb, d);
    expect(rows.find((r) => r.event === 'Surveyor embarked')?.start).toBe(
      '15:47',
    );
    expect(
      rows.find((r) => r.event === 'Initial soundings / Ullage - Vessel')
        ?.start,
    ).toBe('16:17');
    expect(rows.some((r) => /Stoppages|CHIEF ENGINEER/.test(r.event))).toBe(
      false,
    );
  });
  it('ignora apenas linhas inteiramente vazias e exige cache nas linhas identificadas', () => {
    const tables = structuredClone(input.tables);
    tables.vessel_open!.push(Array(13).fill(null));
    expect(auditBqsCalculations({ ...input, tables })).toEqual([]);
    tables.vessel_open!.push(['UNRESOLVED', ...Array(12).fill(null)]);
    expect(
      auditBqsCalculations({ ...input, tables }).some((e) =>
        e.includes('sem valor numérico/cache'),
      ),
    ).toBe(true);
  });
});

it('reavalia comparações após corrigir a outra fonte por override', async () => {
  const { getBqsBlockingIssues } = await import('./buildDocxBqs');
  const spec = JSON.parse(
    readFileSync(
      new URL('../../../../tests/fixtures/specs/bqs.v2.json', import.meta.url),
      'utf8',
    ),
  ) as ReportSpec;
  const extracted = runExtraction(wb, spec);
  const overrides = {
    vessel_name: extracted.data.cover_vessel_name ?? null,
    cover_port: extracted.data.survey_location ?? null,
    cover_chief_engineer: extracted.data.chief_engineer ?? null,
  };
  expect(
    getBqsBlockingIssues(
      extracted.issues,
      { ...extracted.data, ...overrides },
      spec,
      overrides,
    ),
  ).toEqual([]);
});

it('seleciona Word v2 e mantém edição manual após troca de fotos', async () => {
  const { buildReportDocxBqs } = await import('./buildDocxBqs');
  const { replaceBqsPhotoSections } = await import('./bqsDocument');
  const { default: sharp } = await import('sharp');
  const { default: PizZip } = await import('pizzip');
  const a = await sharp({
    create: { width: 1000, height: 600, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const b = await sharp({
    create: { width: 600, height: 1000, channels: 3, background: 'green' },
  })
    .png()
    .toBuffer();
  const initial = await buildReportDocxBqs({
    ...input,
    photos: { cover: [a], vessel_tanks: [a, b, a] },
  });
  const zip = new PizZip(initial),
    doc = 'word/document.xml';
  expect(zip.file(doc)!.asText()).toContain('Barge declared delivered');
  expect(zip.file(doc)!.asText().includes('cx="5143500"')).toBe(true); // 540px at96dpi.
  zip.file(
    doc,
    zip
      .file(doc)!
      .asText()
      .replace('Surveyor’s final remarks:', 'BQS QA 20261026 saved edit:'),
  );
  const fresh = await buildReportDocxBqs({
    ...input,
    photos: { cover: [b], vessel_tanks: [b] },
  });
  const updated = new PizZip(
    replaceBqsPhotoSections(zip.generate({ type: 'nodebuffer' }), fresh),
  );
  expect(updated.file(doc)!.asText()).toContain('BQS QA 20261026 saved edit:');
  expect(
    updated
      .file(doc)!
      .asText()
      .match(/<w:drawing>/g),
  ).toHaveLength(2);
  expect(updated.file('word/styles.xml')!.asText()).toBe(
    zip.file('word/styles.xml')!.asText(),
  );
});
