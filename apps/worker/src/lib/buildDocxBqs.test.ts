import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { runExtraction, type ReportSpec } from '@naabsa/core';
import {
  buildReportDocxBqs,
  auditBqsCalculations,
  readBqsTimeLog,
  type DocxInputBqs,
} from './buildDocxBqs';

let input: DocxInputBqs;
beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/bqs/synthetic.xlsx',
        import.meta.url,
      ),
    ) as never,
  );
  const spec = JSON.parse(
    readFileSync(
      new URL('../../../../tests/fixtures/specs/bqs.v1.json', import.meta.url),
      'utf8',
    ),
  ) as ReportSpec;
  const extracted = runExtraction(wb, spec);
  const data = { ...extracted.data, vessel_close_start: '19:10' };
  input = {
    data,
    tables: extracted.tables,
    photos: {},
    timeLogRows: readBqsTimeLog(wb, data),
  };
});
const xml = (docx: Buffer) =>
  new PizZip(docx).file('word/document.xml')!.asText();
const text = (docx: Buffer) =>
  [...xml(docx).matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
    .map((m) => m[1])
    .join(' ');
describe('BQS — modelo editável derivado do PDF', () => {
  it('preenche dados sintéticos e quantidades sem herdar fatos, fotos ou assinaturas do exemplo', async () => {
    const docx = await buildReportDocxBqs(input);
    const visible = text(docx);
    expect(visible).toContain('MV TEST VESSEL');
    expect(visible).toContain('300.000');
    expect(visible).toContain('290.000');
    expect(visible).toContain('299.500');
    expect(visible).toContain('19:10');
    expect(visible).toContain('0001234');
    expect(visible).not.toMatch(
      /OTHER VESSEL|OTHER SURVEYOR|huge difference|OUT OF ORDER/,
    );
    expect(visible).not.toMatch(/\{[^}]+\}|undefined|NaN/);
    expect(xml(docx)).toContain('bqs_manual_imo');
    expect(xml(docx)).toContain('bqs_manual_final_remarks');
  });
  it('reconcilia fórmulas e detecta diferença sem converter ausência em zero', () => {
    expect(auditBqsCalculations(input)).toEqual([]);
    expect(
      auditBqsCalculations({
        ...input,
        data: { ...input.data, vessel_received: 0 },
      }),
    ).toContain('vessel_received: total inconsistente');
    expect(
      auditBqsCalculations({
        ...input,
        data: { ...input.data, bdn_quantity: null },
      }),
    ).toContain('bdn_quantity: valor ausente ou inválido');
    for (const phase of [
      'vessel_open',
      'vessel_close',
      'barge_open',
      'barge_close',
    ]) {
      expect(
        auditBqsCalculations({
          ...input,
          data: { ...input.data, [`${phase}_vac`]: 99999 },
        }),
      ).toContain(`${phase}_vac: total inconsistente`);
    }
  });
  it('preserva meia-noite calculada no Time Log fora dos eventos mapeados', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/planilhas/bqs/synthetic.xlsx',
          import.meta.url,
        ),
      ) as never,
    );
    wb.getWorksheet('Time Log')!.getCell('E16').value = {
      formula: '0',
      result: 0,
    };
    expect(readBqsTimeLog(wb, input.data)[0]!.start).toBe('00:00');
  });
  it('insere fotos alocadas em ordem e aceita galeria ímpar sem esticar retratos', async () => {
    const a = await sharp({
      create: { width: 30, height: 80, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const b = await sharp({
      create: { width: 80, height: 30, channels: 3, background: '#0000ff' },
    })
      .png()
      .toBuffer();
    const docx = await buildReportDocxBqs({
      ...input,
      photos: { cover: [a], vessel_tanks: [a, b, a] },
    });
    expect(xml(docx).match(/<w:drawing>/g) ?? []).toHaveLength(4);
    expect(xml(docx)).not.toContain('Vessel photograph');
  });
  it('rejeita foto inválida e tabela sem cache em vez de omitir conteúdo', async () => {
    await expect(
      buildReportDocxBqs({ ...input, photos: { cover: [Buffer.from('bad')] } }),
    ).rejects.toThrow();
    const tables = structuredClone(input.tables);
    tables.vessel_open![0]![12] = null;
    await expect(buildReportDocxBqs({ ...input, tables })).rejects.toThrow(
      /vessel_open/,
    );
  });
});
