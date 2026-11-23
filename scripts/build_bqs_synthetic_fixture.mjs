/** Entirely invented data: safe to publish and independent of customer files. */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire(
  new URL('../apps/worker/package.json', import.meta.url),
);
const ExcelJS = require('exceljs');
const spec = JSON.parse(
  readFileSync(
    new URL('../tests/fixtures/specs/bqs.v1.json', import.meta.url),
    'utf8',
  ),
);
const wb = new ExcelJS.Workbook();
wb.creator = 'Naabsa synthetic tests';
wb.created = new Date('2026-01-01T00:00:00Z');
wb.modified = wb.created;
for (const name of [
  'Vessel Ullage',
  'Sounding Barge',
  'Time Log',
  'Sample Report',
])
  wb.addWorksheet(name);
for (const [name, f] of Object.entries(spec.source.common.fields)) {
  const ws = wb.getWorksheet(f.sheet);
  ws.getCell(f.cell).value =
    f.type === 'number'
      ? 0
      : f.type === 'date'
        ? '23/10/2026'
        : f.type === 'time'
          ? '09:00'
          : `TEST ${name}`;
  if (f.row_anchor)
    ws.getCell(`A${f.cell.match(/\d+/)[0]}`).value = f.row_anchor.expect;
}
const v = wb.getWorksheet('Vessel Ullage'),
  b = wb.getWorksheet('Sounding Barge'),
  t = wb.getWorksheet('Time Log');
v.getCell('A6').value = spec.source.fingerprint.expect;
v.getCell('C8').value = 'TEST VESSEL';
v.getCell('I8').value = 'TEST FUEL';
v.getCell('I9').value = 'TEST PORT';
v.getCell('C10').value = 'TEST BARGE';
v.getCell('D74').value = 'TEST ENGINEER';
v.getCell('K74').value = 'TEST SURVEYOR';
t.getCell('A15').value = 'Operation';
t.getCell('A16').value = 'Test preparation';
t.getCell('D16').value = '23/10/2026';
t.getCell('E16').value = '07:00';
t.getCell('A33').value = 'Stoppages/Delays';
t.getCell('E20').value = '08:15';
t.getCell('F20').value = '08:40';
t.getCell('E24').value = '12:50';
t.getCell('E27').value = '18:40';
t.getCell('E28').value = '19;10'; // Deliberately malformed: requires an explicit override.
wb.getWorksheet('Sample Report').getCell('F26').value = '0001234';
for (const [sheet, start, count, col, mass] of [
  [v, 21, 12, 1, 20],
  [v, 41, 12, 1, 70],
  [b, 20, 10, 2, 100],
  [b, 37, 10, 2, 71],
]) {
  for (let i = 0; i < count; i++) {
    const active = sheet === v ? i < 6 : true;
    for (let j = 0; j < 13; j++)
      sheet.getCell(start + i, col + j).value =
        j < 3 || j === 5 ? `T${i + 1}` : 0;
    sheet.getCell(start + i, col + 11).value = {
      formula: active ? `${mass}+0.1` : '0',
      result: active ? mass + 0.1 : 0,
    };
    sheet.getCell(start + i, col + 12).value = {
      formula: active ? String(mass) : '0',
      result: active ? mass : 0,
    };
  }
}
for (const [ws, cells] of [
  [
    v,
    {
      M33: 120,
      M53: 420,
      L33: 120.6,
      L53: 420.6,
      K35: 115,
      M35: 5,
      L58: 299.5,
      L59: 300,
      L60: 0.5,
      L61: (0.5 / 299.5) * 100,
    },
  ],
  [
    b,
    { N30: 1000, N47: 710, M30: 1001, M47: 711, M49: 290, B51: 0.9, E51: 0.89 },
  ],
]) {
  for (const [cell, value] of Object.entries(cells))
    ws.getCell(cell).value = { formula: String(value), result: value };
}
const dir = new URL('../tests/fixtures/planilhas/bqs/', import.meta.url);
mkdirSync(dir, { recursive: true });
await wb.xlsx.writeFile(
  new URL('synthetic.xlsx', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
);
console.log('Created BQS synthetic fixture; no customer input was read.');
