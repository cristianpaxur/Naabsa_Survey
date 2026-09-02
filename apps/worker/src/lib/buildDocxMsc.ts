/**
 * Gera o relatorio MSC (Marine Surveyor Certificate / ROB + Sludge Disposal)
 * como .docx NATIVO reproduzindo o layout do `MSC Report - revisado.docx`. O
 * .docx abre no Word identico ao modelo e o worker converte para PDF via
 * LibreOffice.
 *
 * Entrada: dados efetivos (Summary + Time Log + Sludge) + tabelas extraidas
 * (time_log, sludge_misc, sludge_tanks_before/after) + fotos (vessel /
 * engine_room / survey_attendance).
 *
 * Espelha buildDocx.ts (draft_survey), mas o MSC tem:
 *  - 3 secoes de fotos (sem fase initial/intermediate/final).
 *  - 1 time_log tabular (12 eventos: Surveyor arrived → Surveyor left).
 *  - Sem variantes (nao usa VARIANT.loading/discharge).
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, PageNumber, AlignmentType, BorderStyle, WidthType, VerticalAlign,
  TabStopType, TabStopPosition, LeaderType, HeadingLevel, PageBreak,
  Bookmark, InternalHyperlink, TableLayoutType, LineRuleType,
} from 'docx';

const BODY_LINE = { line: 276, lineRule: LineRuleType.AUTO } as const;
import type { FieldValue } from '@naabsa/core';

const NAVY = '002060';
const GREY = '7F7F7F';
const SLAB = 'Rockwell';
const SANS = 'Calibri';
const TITLE_FONT = 'Tahoma';
// Mesmo surveyor que assina o draft_survey (manter consistencia institucional).
const UNDERSIGNED_SURVEYOR = 'Mr. Wagner de Abreu';

type Data = Record<string, FieldValue>;
export interface DocxInputMsc {
  data: Data;
  logo: Buffer | null;
  coverPhoto?: Buffer | null;
  photos: { vessel?: Buffer[]; engine_room?: Buffer[]; survey_attendance?: Buffer[] };
  /**
   * Linhas do Time Log já normalizadas: cada entry tem data (string YYYY-MM-DD)
   * e horas (string HH:MM). O caller (generatePdf) lê as células da planilha
   * diretamente porque o `extractTables` do core trunca Date em YYYY-MM-DD
   * (perde a hora das colunas G/I).
   */
  timeLogRows: TimeLogRow[];
  tocPages?: Record<string, number>;
}

/** Linha do Time Log pronta para renderizar (já com data+hora convertidas). */
export interface TimeLogRow {
  event: string;
  /** Data ISO (YYYY-MM-DD) ou null. */
  date: string | null;
  /** Hora início HH:MM ou null. */
  start: string | null;
  /** Flag (X ou vazio). */
  flag: string | null;
  /** Hora fim HH:MM ou null. */
  end: string | null;
}

// ── helpers de formatacao (duplicados de buildDocx.ts para nao acoplar) ──────
const v = (x: FieldValue | undefined, fb = '—'): string => (x == null || x === '' ? fb : String(x));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function ord(d: number): string { return d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'; }
function fmtDate(x: FieldValue | undefined): string {
  if (x == null) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x));
  if (!m) return String(x);
  return `${MONTHS[+m[2]! - 1]} ${+m[3]!}${ord(+m[3]!)}, ${+m[1]!}`;
}
function grp(n: number, dec: number): string {
  const neg = n < 0; const f = Math.abs(n).toFixed(dec); const [i, d] = f.split('.');
  return `${neg ? '-' : ''}${i!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d ? '.' + d : ''}`;
}
const mt = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${grp(x, 3)} MT` : v(x));
const ton = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${grp(x, 0)} mt` : v(x));
const meters = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${x.toFixed(2)} m` : v(x));
const num = (x: FieldValue | undefined, d: number): string => (typeof x === 'number' ? x.toFixed(d) : v(x));
function fmtDateShort(x: unknown): string {
  // dd/mm/yyyy a partir de Date ou YYYY-MM-DD (para Time Log).
  if (x == null) return '—';
  if (x instanceof Date) {
    // ExcelJS põe "tempo puro" como Date em 1899-12-30 → não é coluna de data.
    if (x.getUTCFullYear() === 1899) return '—';
    return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`;
  }
  const s = String(x);
  if (s === '' || s === '1899-12-30') return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function fmtTime(x: unknown): string {
  if (x == null || x === '') return '—';
  if (x instanceof Date) {
    const h = String(x.getUTCHours()).padStart(2, '0');
    const mm = String(x.getUTCMinutes()).padStart(2, '0');
    return `${h}:${mm}`;
  }
  const s = String(x);
  if (s === '') return '—';
  // `extractTables` do core serializa Date como string 'YYYY-MM-DD' ou
  // '1899-12-30' (tempo puro). Nesses casos extraímos HH:MM direto do nome.
  const m1899 = /^1899-12-30T(\d{2}):(\d{2})/.exec(s);
  if (m1899) return `${m1899[1]}:${m1899[2]}`;
  // ExcelJS às vezes serializa só '1899-12-30' (sem hora) — não é tempo útil.
  if (s === '1899-12-30') return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1]}:${m[2]}` : s;
}

/** Converte uma célula de tabela (Date/string/number) para string ISO curta (YYYY-MM-DD). */
function cellToDateString(c: unknown): string {
  if (c == null) return '';
  if (c instanceof Date) {
    // Date em epoch (1899-12-30) => tempo puro.
    if (c.getUTCFullYear() === 1899 && c.getUTCMonth() === 11 && c.getUTCDate() === 30) {
      return `1899-12-30T${String(c.getUTCHours()).padStart(2, '0')}:${String(c.getUTCMinutes()).padStart(2, '0')}:00`;
    }
    return `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
  }
  return String(c);
}
function dateMatrix(m: unknown): string[][] {
  if (!Array.isArray(m)) return [];
  return (m as unknown[][]).map((r) => r.map(cellToDateString));
}

const run = (text: string, opts: { bold?: boolean; size?: number; font?: string; color?: string } = {}) =>
  new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: opts.font ?? SANS, color: opts.color });
const para = (children: TextRun[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: number } = {}) =>
  new Paragraph({ children, alignment: opts.align, spacing: { after: opts.spacing ?? 120, ...BODY_LINE } });

const KV_COLS = [2000, 250, 7610] as const;
function kvRow(label: string, value: string): TableRow {
  const cell = (children: Paragraph[], w: number) =>
    new TableCell({ children, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 20, bottom: 20, left: 80, right: 80 } });
  return new TableRow({
    children: [
      cell([new Paragraph({ children: [run(label, { bold: true })] })], KV_COLS[0]),
      cell([new Paragraph({ children: [run(':', { bold: true })] })], KV_COLS[1]),
      cell([new Paragraph({ children: [run(value)] })], KV_COLS[2]),
    ],
  });
}
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;
const NONE_B = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const;
const tableNoBorders = { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideHorizontal: NONE_B, insideVertical: NONE_B };
const insideOnlyBorders = { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideHorizontal: THIN, insideVertical: THIN };
const allBorders = (color = 'BFBFBF') => ({
  top: { style: BorderStyle.SINGLE, size: 4, color } as const,
  bottom: { style: BorderStyle.SINGLE, size: 4, color } as const,
  left: { style: BorderStyle.SINGLE, size: 4, color } as const,
  right: { style: BorderStyle.SINGLE, size: 4, color } as const,
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color } as const,
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color } as const,
});

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function imageSize(buf: Buffer): { w: number; h: number } {
  if (buf.length >= 24 && PNG_SIG.every((b, i) => buf[i] === b) &&
      buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1]!;
      if (marker === 0xff) { o++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return { w: 100, h: 62 };
}
const imgType = (buf: Buffer): 'png' | 'jpg' =>
  buf.length >= 2 && buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : 'jpg';

function img(buf: Buffer, widthMm: number): Paragraph {
  const { w, h } = imageSize(buf);
  const widthPx = Math.round(widthMm * 3.78);
  const heightPx = Math.round(widthPx * (w > 0 ? h / w : 0.62));
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
    new ImageRun({ type: imgType(buf), data: buf, transformation: { width: widthPx, height: heightPx } }),
  ] });
}

/** Mapa slot_id -> label humano. */
const SLOT_LABELS: Record<keyof DocxInputMsc['photos'], string> = {
  vessel: 'Vessel',
  engine_room: 'Engine Room',
  survey_attendance: 'Survey attendance',
};

export async function buildReportDocxMsc(input: DocxInputMsc): Promise<Buffer> {
  const { data, logo } = input;
  const photoSubs = (['vessel', 'engine_room', 'survey_attendance'] as const)
    .filter((k) => (input.photos[k] ?? []).length > 0);

  // Numero de secoes (sem fase Intermediate — MSC tem apenas 1 evento de atracacao).
  const photoNum = 4;
  const attachNum = 5;

  // Sumario (id de bookmark + rotulo + nivel). Fonte unica para Contents e corpo.
  const toc: { id: string; label: string; level: 1 | 2 }[] = [];
  const sec = (n: number, label: string) => toc.push({ id: `s${n}`, label: `${n}. ${label}`, level: 1 });
  const sub = (n: number, m: number, label: string) => toc.push({ id: `s${n}_${m}`, label: `${n}.${m} ${label}`, level: 2 });
  sec(1, "Vessel's details (Ship's Particulars)");
  sec(2, 'Time log');
  sub(2, 1, 'Found at Survey');
  sub(2, 2, 'Purifiers Settings');
  sub(2, 3, 'Temperature');
  sub(2, 4, 'Specific Gravities');
  sub(2, 5, 'Time log');
  sec(3, 'Gross volume — m³');
  sec(photoNum, 'Photographic Report');
  for (const [i, key] of photoSubs.entries()) sub(photoNum, i + 1, SLOT_LABELS[key]);
  sec(attachNum, 'Attachment');

  // ── Cabecalho (logo + tagline + regua) ──
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: VerticalAlign.BOTTOM, children: [
            logo
              ? new Paragraph({ children: [new ImageRun({ type: 'jpg', data: logo, transformation: { width: 150, height: 34 } })] })
              : new Paragraph({ children: [run('NAABSA', { bold: true, size: 32, color: 'BF2C30' })] }),
          ] }),
          new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: VerticalAlign.BOTTOM, children: [
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('MARINE SURVEYORS & CONSULTANTS', { font: SLAB, color: NAVY, size: 22, bold: true })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('Main Brazilian Ports', { font: SLAB, color: NAVY, size: 18 })] }),
          ] }),
        ] })],
      }),
    ],
  });

  // ── Rodape (e-mail | url + no de pagina) ──
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'auto' } },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [run('surveyors@naabsa.com.br | www.naabsa.com', { color: GREY, size: 16 }), new TextRun({ text: '\t', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: SANS })],
    })],
  });

  const body: (Paragraph | Table)[] = [];

  // ── Capa: bloco de endereco (2 colunas) ──
  body.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders(), width: { size: 50, type: WidthType.PERCENTAGE }, children: ['433 Ana Costa Avenue', 'Suite 184 - Santos/Brazil', '11060-003'].map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { size: 19 })] })) }),
      new TableCell({ borders: noBorders(), width: { size: 50, type: WidthType.PERCENTAGE }, children: ['Telephone: +55 13 33940655', 'email: surveyors@naabsa.com', 'www.naabsa.com'].map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { size: 19 })] })) }),
    ] })],
  }));
  body.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ── Capa: titulos ──
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run('Survey Report', { bold: true, size: 36 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(v(data['voy']), { size: 22 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(v(data['appointed_service']), { size: 26, bold: true })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(`“${v(data['vessel_name'], '')}”`, { bold: true, size: 44, font: TITLE_FONT })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(`Flag ${v(data['flag'])} / IMO ${v(data['imo'])}`, { size: 22 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(`at ${v(data['port'])} Port – ${fmtDate(data['berthing_date'])}`, { size: 22 })] }));
  const cover = input.coverPhoto ?? input.photos.vessel?.[0] ?? null;
  if (cover) body.push(img(cover, 150));

  // ── PERSON / COMPANIES CONTACTED — capa (pagina 1) ──
  body.push(plainTitle('PERSON / COMPANIES CONTACTED'));
  body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: insideOnlyBorders, rows: [
    personRow('Client', [v(data['manager'], 'Mediterranean Shipping Company S.A.')]),
    personRow('Undersigned Surveyor', ['NAABSA Marine Surveyors', v(data['surveyors'], UNDERSIGNED_SURVEYOR)]),
    personRow("Vessel's Command", ['Master / Chief Engineer', `${v(data['captain'])} / ${v(data['chief_engineer'])}`]),
  ] }));

  body.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Sumario (Contents) — clicavel, com paginas medidas (2o passe) ──
  body.push(plainTitle('Contents'));
  const measured = input.tocPages ?? {};
  const hasMeasures = Object.keys(measured).length > 0;
  const pageOf = (id: string): string => {
    const p = measured[id];
    if (p == null && hasMeasures) console.warn(`[buildDocxMsc] sumario: sem pagina medida para "${id}"`);
    return p != null ? String(p) : '';
  };
  for (const e of toc) body.push(contentsEntry(e.id, e.label, pageOf(e.id), e.level));

  body.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 1. Vessel's details (Ship's Particulars) ──
  body.push(sectionTitle('s1', toc[0]!.label));
  body.push(new Table({ width: { size: 9860, type: WidthType.DXA }, columnWidths: [...KV_COLS], layout: TableLayoutType.FIXED, borders: tableNoBorders, rows: [
    kvRow('Manager', v(data['manager'])),
    kvRow('Name', v(data['vessel_name'])),
    kvRow('Flag', v(data['flag'])),
    kvRow('Port registry', v(data['port_registry'])),
    kvRow('Call sign', v(data['call_sign'])),
    kvRow('IMO number', v(data['imo'])),
    kvRow('Type', v(data['type'])),
    kvRow('Delivered', v(data['delivered'])),
    kvRow('LOA', meters(data['loa'])),
    kvRow('LBP', meters(data['lbp'])),
    kvRow('Breadth', meters(data['breadth'])),
    kvRow('Depth', meters(data['depth'])),
    kvRow('Net tonnage', ton(data['net_tonnage'])),
    kvRow('Gross tonnage', ton(data['gross_tonnage'])),
    kvRow('Light ship', `${num(data['light_ship'], 2)} t`),
  ] }));

  // ── 2. Time log ──
  body.push(sectionTitle('s2', toc.find((e) => e.id === 's2')!.label));

  // 2.1 Found at Survey
  body.push(subTitle('s2_1', '2.1 Found at Survey'));
  body.push(para([run('We did attend vessel on '), run(fmtDateShort(data['berthing_date'])), run(', to disclose the total of fuel remaining on board, to compare it with vessel’s logbook and to verify the total amount of sludge disposed.')]));
  body.push(para([run('The opening and closing soundings took place with cargo operation/movement in progress.')]));
  body.push(para([run('The purifiers were found switched off and no transfers were carried out.')]));
  if (data['surveyed_by']) {
    body.push(para([run(`The soundings were performed by ${v(data['surveyed_by'])}.`)]));
  }

  // 2.2 Purifiers Settings
  body.push(subTitle('s2_2', '2.2 Purifiers Settings'));
  body.push(new Table({ width: { size: 9860, type: WidthType.DXA }, columnWidths: [...KV_COLS], layout: TableLayoutType.FIXED, borders: tableNoBorders, rows: [
    kvRow('Temperature', `${num(data['purifier_temp'], 0)} °C`),
    kvRow('Flow setting by each purifier', `${v(data['purifier_flow'])} m³`),
    kvRow('Bowl discharging frequency', `${num(data['purifier_bowl_freq'], 0)} minutes`),
  ] }));

  // 2.3 Temperature
  body.push(subTitle('s2_3', '2.3 Temperature'));
  body.push(para([run(`Fuel oil Storage tank – Infrared thermometer: ${v(data['temp_storage_infrared'], 'Display at ECR')}`)]));
  body.push(para([run(`Service tanks – ${v(data['temp_service'], 'Glass thermometer')}`)]));
  body.push(para([run(`Diesel oil storage and Service tanks – Infrared thermometer: ${v(data['temp_do'], 'ER')}`)]));
  if (data['temp_engine_room'] != null) {
    body.push(para([run(`Engine room temperature: ${num(data['temp_engine_room'], 0)} °C`)]));
  }
  if (data['temp_sea_water'] != null) {
    body.push(para([run(`Sea water temperature: ${num(data['temp_sea_water'], 0)} °C`)]));
  }

  // 2.4 Specific Gravities
  body.push(subTitle('s2_4', '2.4 Specific Gravities'));
  body.push(para([run('Applied according to the vessel’s records (BDNs) presented by Chief Engineer at time of survey.')]));

  // ── 3. Gross volume — m³ ──
  body.push(sectionTitle('s3', toc.find((e) => e.id === 's3')!.label));
  body.push(para([run('Calculated according to the ship’s tanks sounding table provided by Chief Engineer at time of survey. All corrections were applied accordingly.')]));
  body.push(para([run('After calculations, the logbook and VRS were updated according to the figures disclosed by surveyor.')]));

  // Tabela de time log (eventos) — vem pré-normalizada de generatePdf.
  if ((input.timeLogRows ?? []).length > 0) {
    body.push(subTitle('s2_5', '2.5 Time log'));
    body.push(timeLogTable(input.timeLogRows!));
  }

  // ── 4. Photographic Report ──
  body.push(new Paragraph({ children: [new PageBreak()] }));
  body.push(sectionTitle(`s${photoNum}`, toc.find((e) => e.id === `s${photoNum}`)!.label));
  for (const [i, key] of photoSubs.entries()) {
    body.push(subTitle(`s${photoNum}_${i + 1}`, `${photoNum}.${i + 1} ${SLOT_LABELS[key]}`));
    for (const ph of input.photos[key] ?? []) body.push(img(ph, 150));
  }
  // Se nao ha fotos em nenhum slot, ainda lista as 3 secoes com placeholder.
  if (photoSubs.length === 0) {
    body.push(subTitle(`s${photoNum}_1`, `${photoNum}.1 Vessel`));
    body.push(subTitle(`s${photoNum}_2`, `${photoNum}.2 Engine Room`));
    body.push(subTitle(`s${photoNum}_3`, `${photoNum}.3 Survey attendance`));
  }

  // ── 5. Attachment ──
  body.push(sectionTitle(`s${attachNum}`, toc.find((e) => e.id === `s${attachNum}`)!.label));
  body.push(para([run('Sludge removal certificates.')]));
  body.push(para([run('Sludge disposal receipts.')]));
  body.push(para([run('VRS / Logbook updated pages.')]));
  body.push(para([run('Calibration certificates (flowmeters).')]));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: SANS, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 22, bold: true, color: NAVY }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1080, left: 1020, right: 1020 } } },
      headers: { default: header }, footers: { default: footer },
      children: body,
    }],
  });
  return Packer.toBuffer(doc) as unknown as Buffer;
}

function noBorders() {
  const n = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const;
  return { top: n, bottom: n, left: n, right: n };
}
function sectionTitle(id: string, t: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 80 }, children: [new Bookmark({ id, children: [run(t, { bold: true, size: 26, color: NAVY })] })] });
}
function plainTitle(t: string): Paragraph {
  return new Paragraph({ spacing: { before: 240, after: 80 }, children: [run(t, { bold: true, size: 26, color: NAVY })] });
}
function contentsEntry(id: string, label: string, page: string, level: 1 | 2): Paragraph {
  const linkRun = (text: string) => new InternalHyperlink({ anchor: id, children: [run(text, { size: 22, bold: level === 1, color: '151515' })] });
  return new Paragraph({
    spacing: { after: 60 },
    indent: level === 2 ? { left: 400 } : undefined,
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
    children: [linkRun(label), new TextRun({ text: '\t', size: 22 }), linkRun(page)],
  });
}
function subTitle(id: string, t: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new Bookmark({ id, children: [run(t, { bold: true, size: 22, color: NAVY })] })] });
}
function personRow(label: string, lines: string[]): TableRow {
  return new TableRow({ children: [
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 30, bottom: 30, left: 100, right: 80 }, children: [new Paragraph({ children: [run(label, { bold: true })] })] }),
    new TableCell({ width: { size: 62, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 30, bottom: 30, left: 100, right: 80 }, children: lines.map((l, i) => new Paragraph({ spacing: { after: 0 }, children: [run(l, { bold: i === 0 })] })) }),
  ] });
}

function timeLogTable(rows: TimeLogRow[]): Table {
  // 5 colunas: Event | Date | Start | x | End. x eh a flag (X ou vazio).
  const c = (t: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new TableCell({
      borders: allBorders(),
      margins: { top: 30, bottom: 30, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: opts.align, spacing: { after: 0 }, children: [run(t, { size: 20, bold: opts.bold })] })],
    });
  const COLS = [5200, 1700, 1300, 600, 1300] as const;
  const head = new TableRow({ children: [
    c('Event', { bold: true }),
    c('Date', { bold: true, align: AlignmentType.CENTER }),
    c('Time', { bold: true, align: AlignmentType.CENTER }),
    c('x', { bold: true, align: AlignmentType.CENTER }),
    c('Time', { bold: true, align: AlignmentType.CENTER }),
  ] });
  const data = rows.map((r) => new TableRow({ children: [
    c(r.event),
    c(fmtDateShort(r.date), { align: AlignmentType.CENTER }),
    c(fmtTime(r.start), { align: AlignmentType.CENTER }),
    c(r.flag ?? '', { align: AlignmentType.CENTER }),
    c(fmtTime(r.end), { align: AlignmentType.CENTER }),
  ] }));
  return new Table({
    width: { size: 10100, type: WidthType.DXA },
    columnWidths: [...COLS],
    layout: TableLayoutType.FIXED,
    borders: allBorders(),
    rows: [head, ...data],
  });
}
