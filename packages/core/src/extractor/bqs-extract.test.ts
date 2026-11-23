import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { validateSpec } from '../spec-schema/validateSpec';
import { runExtraction } from './pipeline';
import { resolveFieldValue } from '../resolveFieldValue';
import type { ReportSpec } from '../types';

const fixture = new URL(
  '../../../../tests/fixtures/planilhas/bqs/synthetic.xlsx',
  import.meta.url,
);
const specFile = new URL(
  '../../../../tests/fixtures/specs/bqs.v1.json',
  import.meta.url,
);
let workbook: ExcelJS.Workbook;
let spec: ReportSpec;
beforeAll(async () => {
  const checked = validateSpec(JSON.parse(readFileSync(specFile, 'utf8')));
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  spec = checked.spec;
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(fixture) as never);
});

describe('BQS — dados sintéticos', () => {
  it('extrai os quatro totais IN AIR sem confundir com IN VAC ou o BDN', () => {
    const result = runExtraction(workbook, spec);
    expect(result.data.vessel_name).toBe('TEST VESSEL');
    expect(result.data.vessel_open_air).toBeCloseTo(120, 9);
    expect(result.data.vessel_close_air).toBeCloseTo(420, 9);
    expect(result.data.barge_open_air).toBeCloseTo(1000, 9);
    expect(result.data.barge_close_air).toBeCloseTo(710, 9);
    expect(result.data.bdn_quantity).toBe(299.5);
    expect(result.data.vessel_received).toBeCloseTo(300, 9);
    expect(result.data.barge_delivered).toBeCloseTo(290, 9);
    expect(result.data.delivery_difference).toBeCloseTo(0.5, 9);
    expect(result.data.delivery_difference_pct).toBeCloseTo(0.5 / 299.5 * 100, 9);
    expect(result.data.vessel_logbook_difference).toBeCloseTo(
      5,
      9,
    );
  });
  it('mantém a correção de 19;10 como override auditável, sem alterar a planilha', () => {
    const result = runExtraction(workbook, spec);
    expect([
      ...new Set(
        result.issues.filter((i) => i.level === 'error').map((i) => i.field),
      ),
    ]).toEqual(['vessel_close_start']);
    expect(
      resolveFieldValue(
        'vessel_close_start',
        { vessel_close_start: '19:10' },
        result.data,
      ),
    ).toBe('19:10');
    expect(workbook.getWorksheet('Time Log')!.getCell('E28').value).toBe(
      '19;10',
    );
  });
  it('preserva data/hora, zero, identificadores e tabelas completas', () => {
    const result = runExtraction(workbook, spec);
    expect(result.data.survey_date).toBe('2026-10-23');
    expect(result.data.vessel_open_start).toBe('08:15');
    expect(result.data.vessel_open_end).toBe('08:40');
    expect(result.data.barge_open_start).toBe('12:50');
    expect(result.data.barge_close_start).toBe('18:40');
    expect(result.data.vessel_open_list).toBe(0);
    expect(result.data.sample_barge_chief).toBe('0001234');
    expect(result.tables.vessel_open).toHaveLength(12);
    expect(result.tables.barge_close).toHaveLength(10);
    expect(result.tables.vessel_open![6]![12]).toBe(0);
  });
  it('localiza eventos por rótulo ao deslocar o Time Log e rejeita cache ausente', async () => {
    const copy = new ExcelJS.Workbook();
    await copy.xlsx.load(readFileSync(fixture) as never);
    copy.getWorksheet('Time Log')!.spliceRows(19, 0, []);
    copy.getWorksheet('Vessel Ullage')!.getCell('L59').value = {
      formula: 'M53-M33',
    };
    const result = runExtraction(copy, spec);
    expect(result.data.vessel_open_start).toBe('08:15');
    expect(result.data.vessel_received).toBeNull();
    expect(
      result.issues.some(
        (i) => i.field === 'vessel_received' && i.level === 'error',
      ),
    ).toBe(true);
  });
  it('preserva caches zero e false que ExcelJS omite do objeto cell.value', async () => {
    const copy = new ExcelJS.Workbook();
    await copy.xlsx.load(readFileSync(fixture) as never);
    copy.getWorksheet('Vessel Ullage')!.getCell('M33').value = {
      formula: '0',
      result: 0,
    };
    copy.getWorksheet('Vessel Ullage')!.getCell('F21').value = {
      formula: 'FALSE()',
      result: false,
    };
    const result = runExtraction(copy, spec);
    expect(result.data.vessel_open_air).toBe(0);
    expect(result.tables.vessel_open![0]![5]).toBe(false);
  });
});
