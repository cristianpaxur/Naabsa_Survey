/**
 * Conteúdo do Draft Survey — módulo COMPARTILHADO entre as variantes
 * `loading` e `discharge` (004/T-011, reescrito 2026-06-23 para fidelidade ao
 * modelo do cliente `MV-PERSEUS-I.model.docx`).
 *
 * Reproduz a estrutura real do Word: capa (Survey Report / navio / flag-IMO /
 * porto-data / foto), Persons/Companies, Contents, Background, Ship's
 * Particulars, e as fases Initial/Intermediate(condicional)/Final com as
 * subseções (Draft readings, Sea water density, Ballast/fresh water, Fuel
 * R.O.B., Draft details como grades nativas) + bloco de Figures, Photographic
 * Report e Attachment.
 *
 * As variantes só diferem em verbos do texto (load/discharge, bound to/loaded
 * in, loaded/discharged) — encapsulados em `VARIANT_TEXT`.
 */

import {
  type TipTapNode,
  text,
  paragraph,
  heading,
  dataField,
  dataTable,
  photoFrame,
} from '../nodes';
import type { BuilderInput } from '../types';
import type { FieldValue } from '../../types';

const W = 150;
const H = 100;

// ── Formatação ────────────────────────────────────────────────────────────

function fmtVal(v: FieldValue | undefined, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

/** Agrupa milhares com vírgula (inglês) e usa ponto decimal. Determinístico. */
function fmtThousands(v: number, decimals: number): string {
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${dec ? '.' + dec : ''}`;
}

function fmtNum(v: FieldValue | undefined, dec: number, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return v.toFixed(dec);
  return String(v);
}

/** Número em metros: "228.99 m". */
function fmtMeters(v: FieldValue | undefined): string {
  if (typeof v === 'number') return `${v.toFixed(2)} m`;
  return v == null ? '—' : String(v);
}

/** Tonelagem inteira com milhares: "27,239 mt". */
function fmtTon(v: FieldValue | undefined): string {
  if (typeof v === 'number') return `${fmtThousands(v, 0)} mt`;
  return v == null ? '—' : String(v);
}

/** Figura de carga: "5,079.578 MT". */
function fmtMt(v: FieldValue | undefined): string {
  if (typeof v === 'number') return `${fmtThousands(v, 3)} MT`;
  return v == null ? '—' : String(v);
}

/** Diferença com sinal: "+ 79.578 MT" / "- 12.500 MT". */
function fmtSignedMt(v: FieldValue | undefined): string {
  if (typeof v !== 'number') return v == null ? '—' : String(v);
  return `${v >= 0 ? '+' : '-'} ${fmtThousands(Math.abs(v), 3)} MT`;
}

/** Diferença percentual (campo guarda fração: 0.01592 → "+ 1.592 %"). */
function fmtSignedPct(v: FieldValue | undefined): string {
  if (typeof v !== 'number') return v == null ? '—' : String(v);
  return `${v >= 0 ? '+' : '-'} ${fmtThousands(Math.abs(v) * 100, 3)} %`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(d: number): string {
  if (d === 1 || d === 21 || d === 31) return 'st';
  if (d === 2 || d === 22) return 'nd';
  if (d === 3 || d === 23) return 'rd';
  return 'th';
}

/** ISO 'YYYY-MM-DD' → inglês 'Month Dth, YYYY' (determinístico, sem locale). */
function fmtDate(v: FieldValue | undefined, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const year = +m[1]!, month = +m[2]!, day = +m[3]!;
  if (month < 1 || month > 12) return s;
  return `${MONTHS[month - 1]} ${day}${ordinal(day)}, ${year}`;
}

/** Hora "08:00" → "08:00h". */
function fmtTime(v: FieldValue | undefined): string {
  return v == null ? '—' : `${String(v)}h`;
}

/** Célula de grade: numéricos sem trailing zeros até 4 casas. */
function fmtCell(v: FieldValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(4).replace(/\.?0+$/, '');
  }
  return String(v);
}

function tableRows(matrix: FieldValue[][] | undefined): string[][] {
  if (!matrix || matrix.length === 0) return [];
  return matrix.map((row) => row.map(fmtCell));
}

/** Heading + dataTable de grade; omitido se a matriz estiver vazia. */
function gradeSection(title: string, tableId: string, matrix: FieldValue[][] | undefined): TipTapNode[] {
  const rows = tableRows(matrix);
  if (rows.length === 0) return [];
  return [heading(3, [text(title)]), dataTable({ tableId, rows })];
}

/** Lado oposto ao de atracação. */
function sideLabel(berthing: FieldValue | undefined): { berthed: string; opposite: string } {
  const v = String(berthing ?? '').toLowerCase();
  if (v.startsWith('star')) return { berthed: 'Starboard side', opposite: 'Port side' };
  if (v.startsWith('port')) return { berthed: 'Port side', opposite: 'Starboard side' };
  return { berthed: fmtVal(berthing), opposite: '—' };
}

/**
 * Linhas de figures das partes "acting as" a partir da matriz extraída.
 * Layout: col 0 = papel ("Terminal's Surveyor"), col 8 = figura (MT).
 * Pula a linha de cabeçalho (row 0).
 */
function actingAsLines(matrix: FieldValue[][] | undefined): TipTapNode[] {
  if (!matrix || matrix.length < 2) return [];
  const out: TipTapNode[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const role = row[0];
    const figure = row[8];
    if (role == null || String(role).trim() === '') continue;
    out.push(paragraph([text(`${String(role).trim()}: ${fmtMt(figure)}`)]));
  }
  return out;
}

// ── Texto por variante ──────────────────────────────────────────────────────

interface VariantText {
  /** verbo da operação: 'load' | 'discharge'. */
  verb: string;
  /** preposição de destino/origem: 'bound to' | 'loaded in'. */
  boundLoaded: string;
  /** particípio: 'loaded' | 'discharged'. */
  done: string;
}

const VARIANT_TEXT: Record<'loading' | 'discharge', VariantText> = {
  loading: { verb: 'load', boundLoaded: 'bound to', done: 'loaded' },
  discharge: { verb: 'discharge', boundLoaded: 'loaded in', done: 'discharged' },
};

// ── Configuração de fase ──────────────────────────────────────────────────

interface PhaseCfg {
  key: 'initial' | 'intermediate' | 'final';
  title: string;
  num: number;
  prefix: 'init' | 'int' | 'fin';
  dateField: string;
  startField: string;
  endField: string;
  heelLabel: 'Heel' | 'List';
  heelField: string;
  heelSideField: string;
  hasFigures: boolean;
  figPrefix: 'int' | 'fin' | null;
  actingAsTableId: string | null;
  photoSlot: string;
  fuelText: string;
}

const SEA_WATER_TEXT =
  'A seawater sample was collected in way of the midship draft mark, on the sea side. ' +
  "The vessel's hydrometer was considered the official instrument for all readings.";

const BALLAST_TEXT =
  'All ballast water tanks were gauged individually, and the volumes were calculated by ' +
  'applying the applicable trim and list corrections. The fresh water quantity was provided ' +
  'by the Chief Officer.';

// ── Builder principal ──────────────────────────────────────────────────────

export function buildDraftSurveyContent(
  input: Pick<BuilderInput, 'data' | 'photos' | 'tables'>,
  variant: 'loading' | 'discharge',
): TipTapNode[] {
  const { data, photos, tables } = input;
  const V = VARIANT_TEXT[variant];

  const photoBySlot = new Map<string, (typeof photos)[number]>();
  for (const p of photos) {
    if (!photoBySlot.has(p.slotId)) photoBySlot.set(p.slotId, p);
  }
  function makePhotoFrame(slotId: string, w = W, h = H) {
    const p = photoBySlot.get(slotId);
    return photoFrame({ slotId, photoId: p?.photoId ?? null, src: p?.src ?? null, widthMm: w, heightMm: h });
  }

  const hasIntermediate = data['intermediate_date'] != null;
  const sides = sideLabel(data['berthing_side']);
  const draftReadingsLine = `Draft readings: ${sides.berthed} from shore, alongside vessel and ${sides.opposite} from boat.`;

  // ── Capa ──────────────────────────────────────────────────────────────────
  const cover: TipTapNode[] = [
    heading(3, [text('Survey Report')], 'center'),
    paragraph([text('Ref: '), text(fmtVal(data['ref']), [dataField('ref')])], 'center'),
    heading(1, [text('Draft Survey')], 'center'),
    heading(2, [text(`“${fmtVal(data['vessel_name'], '')}”`, [dataField('vessel_name')])], 'center'),
    paragraph(
      [
        text('Flag '),
        text(fmtVal(data['flag']), [dataField('flag')]),
        text(' — IMO '),
        text(fmtVal(data['imo']), [dataField('imo')]),
      ],
      'center',
    ),
    paragraph(
      [
        text('at '),
        text(fmtVal(data['port']), [dataField('port')]),
        text(' Port / Brazil — '),
        text(fmtDate(data['final_date']), [dataField('final_date')]),
      ],
      'center',
    ),
    makePhotoFrame('cover', 158, 108),
  ];

  // ── Persons / Companies Contacted (tabela, como o Word) ─────────────────────
  const joinVals = (vals: (FieldValue | undefined)[], sep = ' — '): string => {
    const parts = vals
      .filter((v) => v != null && String(v).trim() !== '')
      .map((v) => String(v).trim());
    return parts.length ? parts.join(sep) : '—';
  };
  const persons: TipTapNode[] = [
    heading(2, [text('PERSON / COMPANIES CONTACTED')]),
    dataTable({
      tableId: 'persons_contacted',
      rows: [
        ['Client', joinVals([data['client'], data['operator']])],
        ['Undersigned Surveyor', joinVals(['NAABSA Marine Surveyors', data['surveyor_name']])],
        [
          "Vessel's Command (Master / Chief Officer)",
          joinVals([data['captain'], data['chief_officer']], ' / '),
        ],
      ],
    }),
  ];

  // ── Contents ────────────────────────────────────────────────────────────────
  const contents: TipTapNode[] = [
    heading(2, [text('Contents')]),
    paragraph([text('1.  Background')]),
    paragraph([text("2.  Ship's Particulars")]),
    paragraph([text('3.  Draft Survey')]),
    paragraph([text('4.  Initial')]),
    ...(hasIntermediate ? [paragraph([text('5.  Intermediate')])] : []),
    paragraph([text('6.  Final')]),
    paragraph([text('7.  Photographic Report')]),
    paragraph([text('8.  Attachment')]),
  ];

  // ── Background ───────────────────────────────────────────────────────────────
  const background: TipTapNode[] = [
    heading(2, [text('1. Background')]),
    paragraph([
      text('In compliance with the appointment survey from Messrs. '),
      text(fmtVal(data['client']), [dataField('client')]),
      text(
        `, we attended the vessel to carry out the Draft Survey to ascertain the total quantity of cargo ${V.done} ` +
          'and to compare it with the Shore scale / Bills of lading.',
      ),
    ]),
    paragraph([
      text('She called '),
      text(fmtVal(data['port']), [dataField('port')]),
      text(` Port to ${V.verb} a cargo of `),
      text(fmtVal(data['cargo']), [dataField('cargo')]),
      text(` in bulk ${V.boundLoaded} `),
      text(fmtVal(data['discharging_port']), [dataField('discharging_port')]),
      text('.'),
    ]),
  ];

  // ── Ship's Particulars ───────────────────────────────────────────────────────
  const particulars: TipTapNode[] = [
    heading(2, [text("2. Ship's Particulars")]),
    dataTable({
      tableId: 'ships_particulars',
      rows: [
        ['Flag', fmtVal(data['flag'])],
        ['Port registry', fmtVal(data['register_port'])],
        ['Call sign', fmtVal(data['call_sign'])],
        ['IMO number', fmtVal(data['imo'])],
        ['Type', fmtVal(data['vessel_type'])],
        ['Delivered', fmtVal(data['delivered'])],
        ['LOA', fmtMeters(data['loa'])],
        ['LBP', fmtMeters(data['lbp'])],
        ['Depth moulded', fmtMeters(data['depth_moulded'])],
        ['Breadth moulded', fmtMeters(data['breadth_moulded'])],
        ['Net tonnage', fmtTon(data['net_tonnage'])],
        ['Gross tonnage', fmtTon(data['gross_tonnage'])],
        ['Summer DWT', fmtTon(data['summer_dwt'])],
      ],
    }),
  ];

  // ── Fases ──────────────────────────────────────────────────────────────────
  const PHASES: PhaseCfg[] = [
    {
      key: 'initial', title: 'Initial', num: 4, prefix: 'init',
      dateField: 'initial_date', startField: 'initial_start', endField: 'initial_end',
      heelLabel: 'Heel', heelField: 'init_heel', heelSideField: 'init_heel_side',
      hasFigures: false, figPrefix: null, actingAsTableId: null,
      photoSlot: 'photos_initial', fuelText: 'According to the logbook — FWE.',
    },
    {
      key: 'intermediate', title: 'Intermediate', num: 5, prefix: 'int',
      dateField: 'intermediate_date', startField: 'intermediate_start', endField: 'intermediate_end',
      heelLabel: 'List', heelField: 'int_list', heelSideField: 'int_list_side',
      hasFigures: true, figPrefix: 'int', actingAsTableId: 'int_figures_acting_as',
      photoSlot: 'photos_intermediate', fuelText: 'Declared by the Chief Engineer at the time of survey.',
    },
    {
      key: 'final', title: 'Final', num: 6, prefix: 'fin',
      dateField: 'final_date', startField: 'final_start', endField: 'final_end',
      heelLabel: 'List', heelField: 'fin_list', heelSideField: 'fin_list_side',
      hasFigures: true, figPrefix: 'fin', actingAsTableId: 'fin_figures_acting_as',
      photoSlot: 'photos_final', fuelText: 'Declared by the Chief Engineer at the time of survey.',
    },
  ];

  function phaseNarrative(p: PhaseCfg): TipTapNode {
    if (p.key === 'initial') {
      return paragraph([
        text(`The ${p.key} Draft Survey was carried out on `),
        text(fmtDate(data[p.dateField]), [dataField(p.dateField)]),
        text(', upon berthing at '),
        text(fmtVal(data['terminal']), [dataField('terminal')]),
        text(' Terminal, shed '),
        text(fmtVal(data['shed']), [dataField('shed')]),
        text(', from '),
        text(fmtTime(data[p.startField]), [dataField(p.startField)]),
        text(' up to '),
        text(fmtTime(data[p.endField]), [dataField(p.endField)]),
        text(" local time jointly with ship's command and the undersigned surveyor."),
      ]);
    }
    return paragraph([
      text(`The ${p.key} Draft Survey was carried out on `),
      text(fmtDate(data[p.dateField]), [dataField(p.dateField)]),
      text(', from '),
      text(fmtTime(data[p.startField]), [dataField(p.startField)]),
      text(' up to '),
      text(fmtTime(data[p.endField]), [dataField(p.endField)]),
      text(
        ` local time jointly with ship's command and the undersigned surveyor to ascertain the ` +
          `total quantity of the cargo ${V.done} being the following figures disclosed:`,
      ),
    ]);
  }

  function figuresBlock(p: PhaseCfg): TipTapNode[] {
    if (!p.hasFigures || !p.figPrefix) return [];
    const fp = p.figPrefix;
    return [
      paragraph([text(`Shore Scale / BsL figures (Official): ${fmtMt(data[`${fp}_fig_shore_scale`])}`)]),
      paragraph([text(`NAABSA's surveyor figures: ${fmtMt(data[`${fp}_fig_naabsa`])}`)]),
      paragraph([
        text(
          `Difference as per our figures: ${fmtSignedMt(data[`${fp}_fig_diff_mt`])} or ` +
            `${fmtSignedPct(data[`${fp}_fig_diff_pct`])}`,
        ),
      ]),
      paragraph([text(`Vessel's figures: ${fmtMt(data[`${fp}_fig_vessel`])}`)]),
      ...(p.actingAsTableId ? actingAsLines(tables[p.actingAsTableId]) : []),
    ];
  }

  /** Tabela combinada de calados (marks + trim/heel/deflection lado a lado). */
  function draftReadingsTable(p: PhaseCfg): TipTapNode {
    const x = p.prefix;
    const heelVal =
      data[p.heelField] != null
        ? `${fmtNum(data[p.heelField], 2)}° ${fmtVal(data[p.heelSideField], '')}`.trim()
        : '—';
    const deflVal =
      data[`${x}_deflection`] != null
        ? `${fmtNum(data[`${x}_deflection`], 1)} cm ${fmtVal(data[`${x}_deflection_type`], '')}`.trim()
        : '—';
    return dataTable({
      tableId: `${x}_readings`,
      headers: ['Draft Mark', 'Means (m)', 'Mean corrected (m)', '', 'Item', 'Value'],
      rows: [
        ['Fwd', fmtNum(data[`${x}_fwd_mean`], 3), fmtNum(data[`${x}_fwd_corr`], 4), '', 'Trim observed', `${fmtNum(data[`${x}_trim_obs`], 4)} m`],
        ['Ms', fmtNum(data[`${x}_mid_mean`], 3), fmtNum(data[`${x}_mid_corr`], 4), '', 'Trim corrected', `${fmtNum(data[`${x}_trim_corr`], 4)} m`],
        ['Aft', fmtNum(data[`${x}_aft_mean`], 3), fmtNum(data[`${x}_aft_corr`], 4), '', p.heelLabel, heelVal],
        ['', '', '', '', 'Deflection', deflVal],
      ],
    });
  }

  function buildPhase(p: PhaseCfg): TipTapNode[] {
    const x = p.prefix;
    return [
      heading(2, [text(`${p.num}. ${p.title}`)]),
      phaseNarrative(p),
      ...figuresBlock(p),
      paragraph([text(draftReadingsLine)]),
      heading(3, [text(`${p.num}.1. Draft readings`)]),
      draftReadingsTable(p),
      heading(3, [text(`${p.num}.2. Sea water density`)]),
      paragraph([text(SEA_WATER_TEXT)]),
      heading(3, [text(`${p.num}.3. Ballast water and fresh water`)]),
      paragraph([text(BALLAST_TEXT)]),
      heading(3, [text(`${p.num}.4. Fuel R.O.B.`)]),
      paragraph([text(p.fuelText)]),
      heading(3, [text(`${p.num}.5. ${p.title} Draft details`)]),
      ...gradeSection('Draft marks & corrections', `${x}_draft_marks`, tables[`${x}_draft_marks`]),
      ...gradeSection('Displacement corrections', `${x}_displacement`, tables[`${x}_displacement`]),
      ...gradeSection('Ballast water', `${x}_ballast`, tables[`${x}_ballast`]),
      ...gradeSection('Fresh water & bunkers', `${x}_freshwater`, tables[`${x}_freshwater`]),
    ];
  }

  const initial = buildPhase(PHASES[0]!);
  const intermediate = hasIntermediate ? buildPhase(PHASES[1]!) : [];
  const final_ = buildPhase(PHASES[2]!);

  // ── Photographic Report ─────────────────────────────────────────────────────
  const photoReport: TipTapNode[] = [
    heading(2, [text('7. Photographic Report')]),
    heading(3, [text('7.1. Initial')]),
    makePhotoFrame('photos_initial'),
    ...(hasIntermediate
      ? [heading(3, [text('7.2. Intermediate')]), makePhotoFrame('photos_intermediate')]
      : []),
    heading(3, [text('7.3. Final')]),
    makePhotoFrame('photos_final'),
  ];

  // ── Attachment ──────────────────────────────────────────────────────────────
  const attachment: TipTapNode[] = [
    heading(2, [text('8. Attachment')]),
    paragraph([text('Draft Survey Certificates issued by undersigned surveyor.')]),
    paragraph([text('Draft Survey Certificate issued by vessel.')]),
    paragraph([text("Draft Survey Certificate issued by Terminal's surveyor.")]),
  ];

  return [
    ...cover,
    ...persons,
    ...contents,
    ...background,
    ...particulars,
    heading(2, [text('3. Draft Survey')]),
    ...initial,
    ...intermediate,
    ...final_,
    ...photoReport,
    ...attachment,
  ];
}
