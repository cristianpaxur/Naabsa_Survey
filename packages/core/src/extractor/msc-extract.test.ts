import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runExtraction } from './pipeline';
import { validateSpec } from '../spec-schema/validateSpec';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../../../tests/fixtures');
const xlsxPath = join(fixtures, 'planilhas/msc/msc.real.v1.xlsx');
const specPath = join(fixtures, 'specs/msc.v1.json');

let workbook: ExcelJS.Workbook;
let spec: ReturnType<typeof validateSpec> & { valid: true };

beforeAll(async () => {
  const result = validateSpec(JSON.parse(readFileSync(specPath, 'utf8')) as unknown);
  if (!result.valid) throw new Error(result.errors.join('; '));
  spec = result as typeof spec;
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
});

describe('MSC — contrato da planilha SABRINA', () => {
  it('aceita o spec e a planilha com todas as abas de origem', () => {
    expect(spec.valid).toBe(true);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining([
      'Summary', 'Time Log', 'Sludge', 'Qtt Sumary', 'LOG Audit',
    ]));
  });

  it('extrai as seções que alimentam o relatório sem erros', () => {
    const { data, issues } = runExtraction(workbook, spec.spec);
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(data.vessel_name).toBeTruthy();
    expect(data.loa).not.toBeNull();
    expect(data.lbp).not.toBeNull();
    expect(Object.keys(data)).toEqual(expect.arrayContaining([
      'grade_1_surveyor', 'sludge_surveyor', 'flowmeter_accuracy',
      'logbook_updated', 'vrs_updated',
    ]));
  });
});
