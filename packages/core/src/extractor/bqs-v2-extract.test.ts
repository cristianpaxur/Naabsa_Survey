import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { validateSpec } from '../spec-schema/validateSpec';
import { runExtraction } from './pipeline';
it('extracts BQS v2 discriminant source quantities, cover identity and 13-column tanks', async () => {
  const checked = validateSpec(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/specs/bqs.v2.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/bqs/synthetic-v2.xlsx',
        import.meta.url,
      ),
    ) as never,
  );
  const r = runExtraction(wb, checked.spec);
  expect(r.data.vessel_name).toBe('TEST OPERATIONS VESSEL');
  expect(r.data.cover_vessel_name).toBe('TEST COVER VESSEL');
  expect(r.data.vessel_open_air).toBe(111.125);
  expect(r.data.vessel_close_air).toBe(444.875);
  expect(r.data.vessel_received).toBe(333.75);
  expect(r.data.barge_delivered).toBe(322.5);
  expect(r.data.cover_logbook_difference).toBe(-11.125);
  expect(r.data.vessel_open_list).toBe(0);
  expect(r.data.sample_barge_chief).toBe('0001234');
  expect(r.tables.vessel_open).toHaveLength(25);
  expect(r.tables.vessel_close).toHaveLength(19);
  expect(r.tables.barge_open).toHaveLength(8);
  expect(r.tables.barge_close![0]).toHaveLength(13);
  expect(r.tables.vessel_open![0]![12]).toBe(0);
  expect(r.data.vessel_open_start).toBe('17:11');
});
it('keeps invalid dates and absent formula caches explicit and resolves moved event anchors', async () => {
  const checked = validateSpec(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../tests/fixtures/specs/bqs.v2.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/bqs/synthetic-v2.xlsx',
        import.meta.url,
      ),
    ) as never,
  );
  wb.getWorksheet('Vessel')!.getCell('L78').value = { formula: 'M72-M45' };
  wb.getWorksheet('Time Log')!.getCell('D22').value = 'not a date';
  wb.getWorksheet('Time Log')!.spliceRows(19, 0, []);
  const r = runExtraction(wb, checked.spec);
  expect(r.data.vessel_received).toBeNull();
  expect(
    r.issues.some((i) => i.field === 'vessel_received' && i.level === 'error'),
  ).toBe(true);
  expect(
    r.issues.some(
      (i) => i.field === 'vessel_open_date' && i.message.includes('not a date'),
    ),
  ).toBe(true);
  expect(r.data.vessel_open_start).toBe('17:11');
});
