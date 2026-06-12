import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { runExtraction } from './pipeline';
import { buildWorkbook } from './synthFixtures';
import type { ReportSpec, FieldDef } from '../types';

// RNF-03: extração < 5 s. O custo no core escala com o nº de campos do spec
// (extract lê só as células declaradas, não a planilha inteira); o carregamento
// do .xlsx de até 5 MB é responsabilidade do app (ExcelJS.load).
function bigSpec(n: number): ReportSpec {
  const fields: Record<string, FieldDef> = {};
  for (let i = 0; i < n; i++) {
    fields[`f${i}`] = {
      cell: `B${i + 2}`,
      type: 'string',
      label: `Campo ${i}`,
      section: 'Big',
    };
  }
  return {
    report_type: 'big',
    version: 1,
    variants: [],
    source: {
      sheet: 'DADOS',
      fingerprint: { cell: 'A1', expect: 'BIG' },
      common: { fields },
    },
  };
}

function bigWorkbook(n: number): ExcelJS.Workbook {
  const cells: Record<string, ExcelJS.CellValue> = {};
  for (let i = 0; i < n; i++) cells[`B${i + 2}`] = `valor ${i}`;
  return buildWorkbook({ fingerprint: 'BIG', cells });
}

describe('performance (RNF-03)', () => {
  it('extrai 300 campos bem abaixo de 5 s', () => {
    const n = 300;
    const spec = bigSpec(n);
    const wb = bigWorkbook(n);

    const t0 = performance.now();
    const { data, issues } = runExtraction(wb, spec, null);
    const elapsed = performance.now() - t0;

    expect(Object.keys(data)).toHaveLength(n);
    expect(issues).toHaveLength(0);
    expect(elapsed).toBeLessThan(1000);
  });
});
