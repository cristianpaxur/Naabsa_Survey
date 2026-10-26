/** BQS adapter. All cell addresses live in the spec; Word owns the layout. */
import { readFile } from 'node:fs/promises';
import type ExcelJS from 'exceljs';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import PizZip from 'pizzip';
import sharp from 'sharp';
import {
  addBqsPhotoBookmarks,
  BQS_PHOTO_SLOTS,
  type BqsPhotoSlot,
} from './bqsPhotoRegions';
export { BQS_PHOTO_SLOTS, type BqsPhotoSlot } from './bqsPhotoRegions';
import {
  coerceField,
  normalizeWorksheetCell,
  validate,
  type ReportSpec,
  type Issue,
  type FieldValue,
  type NumberFormatMap,
} from '@naabsa/core';

export interface BqsTimeLogRow {
  event: string;
  date: string;
  start: string;
  end: string;
}
export interface DocxInputBqs {
  templateVersion?: 1 | 2;
  data: Record<string, FieldValue>;
  tables: Record<string, FieldValue[][]>;
  numberFormats?: NumberFormatMap;
  photos: Partial<Record<BqsPhotoSlot, Buffer[]>>;
  timeLogRows: BqsTimeLogRow[];
  tocPages?: Record<string, number>;
}
const TEMPLATE = new URL(
  '../../../../templates/bqs.clean.docx',
  import.meta.url,
);
const DASH = '—';
const string = (value: unknown) =>
  value == null || value === '' ? DASH : String(value);
const num = (value: FieldValue | undefined, decimals = 3) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : string(value);
const date = (value: FieldValue | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : string(value);
};

/** Extraction errors require an explicit correction; comparisons use current values. */
export function getBqsBlockingIssues(
  extractedIssues: Issue[],
  data: Record<string, FieldValue>,
  spec: ReportSpec,
  overrides: Record<string, FieldValue>,
): Issue[] {
  return [
    ...extractedIssues.filter(
      (i) => i.origin === 'extraction' && !Object.hasOwn(overrides, i.field),
    ),
    ...validate(data, spec, null),
  ].filter((i) => i.level === 'error');
}

/** Preserve the table's event order. Apply the same reviewed values used by prose. */
export function readBqsTimeLog(
  wb: ExcelJS.Workbook,
  data: Record<string, FieldValue>,
): BqsTimeLogRow[] {
  const ws = wb.getWorksheet('Time Log');
  if (!ws) throw new Error('BQS: aba Time Log ausente.');
  const mapped: Record<string, string> = {
    'Surveyor onboard': 'arrival',
    'Meeting between C/E and surveyor': 'meeting',
    'Initial Soundings/Ullage - Vessel': 'vessel_open',
    'Bunker Barge arrived': 'barge_arrival',
    'Initial Soundings/Ullage - Barge': 'barge_open',
    'Bunkering operation': 'bunkering',
    'Final Soundings/Ullage - Barge': 'barge_close',
    'Final Soundings/Ullage - Vessel': 'vessel_close',
    'Surveyor off board': 'departure',
    'Surveyor embarked': 'arrival',
    'Meeting between Chief Engineer and Surveyor': 'meeting',
    'Initial soundings / Ullage - Vessel': 'vessel_open',
    'Initial soundings / Ullage - Barge': 'barge_open',
    'Final soundings / Ullage - Barge': 'barge_close',
    'Final soundings / Ullage - Vessel': 'vessel_close',
    'Surveyor disembarked': 'departure',
  };
  const rows: BqsTimeLogRow[] = [];
  let reading = false;
  for (let r = 1; r <= Math.min(ws.rowCount, 200); r++) {
    const event = string(normalizeWorksheetCell(ws.getCell(r, 1))).trim();
    if (event === 'Operation') {
      reading = true;
      continue;
    }
    if (/^Stoppages\s*\/\s*Delays\s*:?$/i.test(event)) break;
    if (!reading || event === DASH) continue;
    const read = (col: number, kind: 'date' | 'time', suffix: string) => {
      const key = mapped[event] && `${mapped[event]}_${suffix}`;
      if (key && Object.hasOwn(data, key)) return data[key] ?? null;
      const result = coerceField(
        normalizeWorksheetCell(ws.getCell(r, col)),
        kind === 'date'
          ? {
              type: 'date',
              cell: `D${r}`,
              label: event,
              section: 'Time log',
              format: 'DD/MM/YYYY',
            }
          : {
              type: 'time',
              cell: `${col === 5 ? 'E' : 'F'}${r}`,
              label: event,
              section: 'Time log',
            },
        { date1904: Boolean(wb.properties.date1904) },
      );
      if (result.error) throw new Error(`BQS Time Log: ${result.error}`);
      return result.value;
    };
    rows.push({
      event,
      date: date(read(4, 'date', 'date')),
      start: string(read(5, 'time', 'start')),
      end: string(read(6, 'time', 'end')),
    });
  }
  if (!rows.length) throw new Error('BQS: Time Log sem eventos.');
  return rows;
}

/** Independent reconciliation of cached results; no workbook recalculation or rounding early. */
export function auditBqsCalculations(
  input: Pick<DocxInputBqs, 'data' | 'tables' | 'templateVersion'>,
): string[] {
  const v2 = input.templateVersion === 2;
  const issues: string[] = [];
  const number = (name: string) => {
    const value = input.data[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`${name}: valor ausente ou inválido`);
      return null;
    }
    return value;
  };
  const eq = (
    name: string,
    actual: number | null,
    wanted: number | null,
    tolerance = 0.000001,
  ) => {
    if (
      actual != null &&
      wanted != null &&
      Math.abs(actual - wanted) > tolerance
    )
      issues.push(`${name}: total inconsistente`);
  };
  const values = Object.fromEntries(
    [
      'vessel_open_air',
      'vessel_close_air',
      'barge_open_air',
      'barge_close_air',
      'vessel_open_vac',
      'vessel_close_vac',
      'barge_open_vac',
      'barge_close_vac',
      'bdn_quantity',
      'vessel_received',
      'barge_delivered',
      'delivery_difference',
      'delivery_difference_pct',
      'vessel_logbook',
      ...(v2
        ? [
            'cover_logbook_difference',
            'barge_declared_delivered',
            'barge_delivery_difference',
          ]
        : ['vessel_logbook_difference']),
    ].map((name) => [name, number(name)]),
  );
  const difference = (a: string, b: string) =>
    values[a] != null && values[b] != null ? values[a]! - values[b]! : null;
  eq(
    'vessel_received',
    values.vessel_received!,
    difference('vessel_close_air', 'vessel_open_air'),
  );
  eq(
    'barge_delivered',
    values.barge_delivered!,
    difference('barge_open_air', 'barge_close_air'),
  );
  eq(
    'delivery_difference',
    values.delivery_difference!,
    difference('vessel_received', 'bdn_quantity'),
  );
  eq(
    v2 ? 'cover_logbook_difference' : 'vessel_logbook_difference',
    values[v2 ? 'cover_logbook_difference' : 'vessel_logbook_difference']!,
    v2
      ? difference('vessel_logbook', 'vessel_open_air')
      : difference('vessel_open_air', 'vessel_logbook'),
  );
  if (v2)
    eq(
      'barge_delivery_difference',
      values.barge_delivery_difference!,
      difference('barge_delivered', 'barge_declared_delivered'),
    );
  const percentBase = v2 ? values.vessel_received : values.bdn_quantity;
  if (
    percentBase != null &&
    percentBase !== 0 &&
    values.delivery_difference != null
  )
    eq(
      'delivery_difference_pct',
      values.delivery_difference_pct!,
      (values.delivery_difference / percentBase) * 100,
    );
  for (const key of [
    'vessel_open',
    'vessel_close',
    'barge_open',
    'barge_close',
  ]) {
    const rows = input.tables[key];
    if (!rows?.length) {
      issues.push(`${key}: tabela ausente`);
      continue;
    }
    let total = 0;
    let totalVac = 0;
    for (const [i, row] of rows.entries()) {
      if (row.every((v) => v == null || v === '')) continue;
      for (const c of [3, 4, 6, 7, 8, 9, 10, 11, 12])
        if (typeof row[c] !== 'number' || !Number.isFinite(row[c]))
          issues.push(
            `${key}: linha ${i + 1}, coluna ${c + 1} sem valor numérico/cache`,
          );
      if (typeof row[12] === 'number') total += row[12];
      if (typeof row[11] === 'number') totalVac += row[11];
    }
    eq(`${key}_air`, values[`${key}_air`] ?? null, total);
    eq(`${key}_vac`, values[`${key}_vac`] ?? null, totalVac);
  }
  return [...new Set(issues)];
}

export async function buildReportDocxBqs(input: DocxInputBqs): Promise<Buffer> {
  const tableIssues = auditBqsCalculations(input).filter((issue) =>
    /tabela ausente|sem valor numérico/.test(issue),
  );
  if (tableIssues.length) throw new Error(`BQS: ${tableIssues.join('; ')}`);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.data)) {
    const fallback = /density/.test(key)
      ? 4
      : /_(?:fore|aft|list)$/.test(key)
        ? 2
        : 3;
    values[key] = /_date$|calibration$/.test(key)
      ? date(value)
      : typeof value === 'number'
        ? num(value, input.numberFormats?.[key] ?? fallback)
        : string(value);
  }
  for (const name of [
    'vessel_logbook_difference',
    'delivery_difference',
    'delivery_difference_pct',
  ]) {
    const raw = input.data[name];
    if (typeof raw === 'number' && raw > 0) values[name] = `+${values[name]}`;
  }
  for (const key of [
    'vessel_open',
    'vessel_close',
    'barge_open',
    'barge_close',
  ]) {
    const rows = input.tables[key]!.filter((row) =>
      row.some((v) => v != null && v !== ''),
    );
    values[`${key}_rows`] = rows.map((row) =>
      Object.fromEntries(
        row.map((v, i) => [
          `c${i}`,
          typeof v !== 'number'
            ? string(v)
            : num(
                v,
                [0].includes(i) ? 0 : i === 3 ? 1 : [8, 9].includes(i) ? 4 : 3,
              ),
        ]),
      ),
    );
    values[`${key}_gross`] = num(
      rows.reduce((sum, row) => sum + (row[7] as number), 0),
    );
    values[`${key}_standard`] = num(
      rows.reduce((sum, row) => sum + (row[10] as number), 0),
    );
  }
  // Density on rows with zero measured volume remains in the table but does not
  // imply that this fuel was physically present in an opening tank.
  values.vessel_densities = [
    ...new Set(
      input.tables
        .vessel_open!.filter((row) => typeof row[7] === 'number' && row[7] > 0)
        .map((row) => num(row[9], 4)),
    ),
  ].join(' / ');
  values.time_log = input.timeLogRows;
  for (const id of [
    's1',
    's2',
    's3',
    's4',
    's4_1',
    's4_2',
    's4_3',
    's4_4',
    's4_5',
    's4_6',
    's4_7',
    's4_8',
    's5',
    's5_1',
    's5_2',
    's6',
    's7',
    's7_1',
    's7_2',
    's7_3',
    's8',
    's8_1',
    's8_2',
  ])
    values[`toc_${id}`] = input.tocPages?.[`bqs_${id}`] ?? DASH;
  const images = new Map<string, { buffer: Buffer; size: [number, number] }>();
  for (const slot of BQS_PHOTO_SLOTS) {
    const photos = input.photos[slot] ?? [];
    if (slot === 'cover' && photos.length > 1)
      throw new Error('BQS: capa aceita uma foto.');
    const prepared = await Promise.all(
      photos.map(async (buffer, i) => {
        const png = await sharp(buffer).rotate().png().toBuffer();
        const meta = await sharp(png).metadata();
        if (!meta.width || !meta.height)
          throw new Error(`BQS: foto inválida em ${slot}.`);
        const scale = Math.min(
          (slot === 'cover' ? (input.templateVersion === 2 ? 540 : 640) : 325) /
            meta.width,
          (slot === 'cover' ? (input.templateVersion === 2 ? 330 : 385) : 245) /
            meta.height,
        );
        const key = `${slot}_${i}`;
        images.set(key, {
          buffer: png,
          size: [
            Math.round(meta.width * scale),
            Math.round(meta.height * scale),
          ],
        });
        return { image: key };
      }),
    );
    values[`photos_${slot}`] =
      slot === 'cover'
        ? prepared
        : prepared
            .filter((_photo, i) => i % 2 === 0)
            .map((left, i) => ({
              ...left,
              right: prepared[2 * i + 1] ? [prepared[2 * i + 1]] : [],
            }));
  }
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (key) => {
      const value = images.get(String(key));
      if (!value) throw new Error('BQS: imagem alocada ausente.');
      return value.buffer;
    },
    getSize: (_buffer, key) => images.get(String(key))!.size,
  });
  const template =
    input.templateVersion === 2
      ? new URL('../../../../templates/bqs.v2.clean.docx', import.meta.url)
      : TEMPLATE;
  const rendered = new Docxtemplater(new PizZip(await readFile(template)), {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => DASH,
  });
  rendered.render(values);
  addBqsPhotoBookmarks(rendered.getZip());
  return rendered
    .getZip()
    .generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
