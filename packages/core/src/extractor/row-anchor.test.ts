import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '../spec-schema/validateSpec';
import type { ReportSpec } from '../types';
import { runExtraction } from './pipeline';

function anchoredSpec(): ReportSpec {
  const result = validateSpec({
    contract: 2,
    report_type: 'msc',
    version: 1,
    variants: [],
    source: {
      fingerprint: {
        sheet: 'Sludge',
        cell: 'H28',
        expect: 'PURIFIERS SETTINGS',
      },
      common: {
        fields: {
          purifier_temp: {
            sheet: 'Sludge',
            cell: 'K29',
            type: 'number',
            label: 'Temperatura purificador',
            section: 'Purificadores',
            row_anchor: { range: 'H29:H40', expect: 'Temperature (°C)' },
          },
        },
      },
    },
  });
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error(result.errors.join('; '));
  return result.spec;
}

function workbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Sludge').getCell('H28').value = 'PURIFIERS SETTINGS';
  return wb;
}

describe('extração por rótulo de linha', () => {
  it('aceita uma grafia alternativa explícita e recusa duas linhas equivalentes', () => {
    const spec = anchoredSpec();
    spec.source.common.fields.purifier_temp!.row_anchor!.aliases = [
      'Temp (°C)',
    ];
    expect(validateSpec(spec).valid).toBe(true);
    const wb = workbook();
    const ws = wb.getWorksheet('Sludge')!;
    ws.getCell('H32').value = 'Temp (°C)';
    ws.getCell('K32').value = 98;
    expect(runExtraction(wb, spec).data.purifier_temp).toBe(98);
    ws.getCell('H33').value = 'Temperature (°C)';
    ws.getCell('K33').value = 100;
    expect(runExtraction(wb, spec).data.purifier_temp).toBeNull();
    spec.source.common.fields.purifier_temp!.row_anchor!.aliases = [' '];
    expect(validateSpec(spec).valid).toBe(false);
  });

  it.each([29, 32])(
    'lê a temperatura na linha %i sem usar um valor de outra linha',
    (row) => {
      const spec = anchoredSpec();
      const wb = workbook();
      const ws = wb.getWorksheet('Sludge')!;
      ws.getCell('K29').value = 999;
      ws.getCell(`H${row}`).value = 'Temperature (°C)';
      ws.getCell(`K${row}`).value = { formula: '49*2', result: 98 };
      ws.getCell(`K${row}`).numFmt = '0.0';

      const result = runExtraction(wb, spec);

      expect(result.data.purifier_temp).toBe(98);
      expect(result.numberFormats.purifier_temp).toBe(1);
      expect(result.issues).toEqual([]);
    },
  );

  it('preserva zero na linha identificada', () => {
    const spec = anchoredSpec();
    const wb = workbook();
    wb.getWorksheet('Sludge')!.getCell('H32').value = 'Temperature (°C)';
    wb.getWorksheet('Sludge')!.getCell('K32').value = 0;
    expect(runExtraction(wb, spec).data.purifier_temp).toBe(0);
  });

  it.each(['ausente', 'duplicado'])(
    'recusa rótulo %s sem aproveitar a célula fixa',
    (kind) => {
      const spec = anchoredSpec();
      const wb = workbook();
      const ws = wb.getWorksheet('Sludge')!;
      ws.getCell('K29').value = 999;
      if (kind === 'duplicado') {
        ws.getCell('H32').value = 'Temperature (°C)';
        ws.getCell('H33').value = 'Temperature (°C)';
      }
      const result = runExtraction(wb, spec);
      expect(result.data.purifier_temp).toBeNull();
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'purifier_temp',
            level: 'error',
            origin: 'extraction',
          }),
        ]),
      );
    },
  );

  it('mantém a célula fixa nos specs históricos sem rótulo de linha', () => {
    const spec = anchoredSpec();
    delete spec.source.common.fields.purifier_temp!.row_anchor;
    const wb = workbook();
    wb.getWorksheet('Sludge')!.getCell('K29').value = 105;
    wb.getWorksheet('Sludge')!.getCell('H32').value = 'Temperature (°C)';
    wb.getWorksheet('Sludge')!.getCell('K32').value = 98;
    expect(runExtraction(wb, spec).data.purifier_temp).toBe(105);
  });

  it.each(['H40:H29', 'H1:I40', 'H1:H200', 'H0:H40'])(
    'rejeita busca inválida ou ampla: %s',
    (range) => {
      const spec = anchoredSpec();
      spec.source.common.fields.purifier_temp!.row_anchor!.range = range;
      expect(validateSpec(spec).valid).toBe(false);
    },
  );
});
