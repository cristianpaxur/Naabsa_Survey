/** Built from a blank workbook with invented discriminant values only. */
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const spec = JSON.parse(
  readFileSync(
    new URL('../tests/fixtures/specs/bqs.v2.json', import.meta.url),
    'utf8',
  ),
);
const wb = new ExcelJS.Workbook();
wb.creator = 'Naabsa synthetic tests';
wb.created = new Date('2026-01-01T00:00:00Z');
wb.modified = wb.created;
for (const name of [
  'Capa',
  'Vessel',
  'Barge',
  'Sample Report',
  'Time Log',
  'Letter of Protest',
  'VacuoAr',
])
  wb.addWorksheet(name);
for (const [id, f] of Object.entries(spec.source.common.fields)) {
  const cell = wb.getWorksheet(f.sheet).getCell(f.cell);
  cell.value =
    f.type === 'number'
      ? 0
      : f.type === 'date'
        ? '10/05/2026'
        : f.type === 'time'
          ? '17:00'
          : `TEST ${id}`;
  if (f.row_anchor)
    wb.getWorksheet(f.sheet).getCell(`A${f.cell.match(/\d+/)[0]}`).value =
      f.row_anchor.expect;
}
wb.getWorksheet('Vessel').getCell('A6').value = spec.source.fingerprint.expect;
for (const table of spec.source.tables) {
  const match = table.range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const ws = wb.getWorksheet(table.sheet);
  const col = table.sheet === 'Vessel' ? 1 : 2;
  for (let row = Number(match[2]); row <= Number(match[4]); row++)
    for (let c = 0; c < 13; c++) {
      const cell = ws.getCell(row, col + c);
      cell.value =
        c === 0
          ? `TEST TANK ${row}`
          : c === 1
            ? 'TEST FUEL'
            : c >= 11
              ? { formula: '0', result: 0 }
              : c + 0.125;
      cell.numFmt = '0.000';
    }
}
const values = {
  vessel_loa: '229.00',
  vessel_name: 'TEST OPERATIONS VESSEL',
  cover_vessel_name: 'TEST COVER VESSEL',
  vessel_open_air: 111.125,
  vessel_close_air: 444.875,
  vessel_open_vac: 112.25,
  vessel_close_vac: 446.5,
  vessel_received: 333.75,
  bdn_quantity: 335.25,
  delivery_difference: -1.5,
  delivery_difference_pct: (-1.5 / 333.75) * 100,
  barge_open_air: 900.75,
  barge_close_air: 578.25,
  barge_open_vac: 902.5,
  barge_close_vac: 580,
  barge_delivered: 322.5,
  barge_declared_delivered: 325,
  barge_delivery_difference: -2.5,
  vessel_logbook: 100,
  cover_logbook_difference: -11.125,
  sample_barge_chief: '0001234',
  arrival_start: '16:30',
  arrival_end: '16:35',
  meeting_start: '16:40',
  meeting_end: '17:00',
  barge_arrival_start: '16:20',
  barge_arrival_end: '16:25',
  vessel_open_start: '17:11',
  vessel_open_end: '17:37',
  barge_open_start: '18:03',
  barge_open_end: '18:27',
  bunkering_start: '18:45',
  bunkering_end: '21:50',
  barge_close_start: '22:04',
  barge_close_end: '22:19',
  vessel_close_start: '22:23',
  vessel_close_end: '22:47',
  departure_start: '23:10',
  departure_end: '23:15',
};
for (const [id, value] of Object.entries(values)) {
  const f = spec.source.common.fields[id];
  wb.getWorksheet(f.sheet).getCell(f.cell).value =
    typeof value === 'number'
      ? { formula: String(value), result: value }
      : value;
}
// Reconcile the entire mapped range with each independent scalar total.
// Row one remains a cached zero; row two carries a discriminant nonzero mass.
for (const table of spec.source.tables) {
  const start = Number(table.range.match(/\d+/)[0]);
  const ws = wb.getWorksheet(table.sheet);
  const col = table.sheet === 'Vessel' ? 1 : 2;
  for (const [offset, suffix] of [
    [11, 'vac'],
    [12, 'air'],
  ]) {
    const value = values[`${table.id}_${suffix}`];
    ws.getCell(start + 1, col + offset).value = {
      formula: String(value),
      result: value,
    };
  }
}
const timeLog = wb.getWorksheet('Time Log');
timeLog.getCell('A15').value = 'Operation';
timeLog.getCell('A16').value = 'Test preparation';
timeLog.getCell('D16').value = '10/05/2026';
timeLog.getCell('E16').value = 0;
timeLog.getCell('F16').value = null;
timeLog.getCell('A35').value = 'Stoppages / Delays :';
await wb.xlsx.writeFile(
  fileURLToPath(
    new URL(
      '../tests/fixtures/planilhas/bqs/synthetic-v2.xlsx',
      import.meta.url,
    ),
  ),
);
