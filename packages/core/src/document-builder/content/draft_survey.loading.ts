/**
 * Conteúdo real do Draft Survey — variante LOADING.
 * Texto em inglês conforme o modelo MV-PERSEUS-I.model.docx (recebido 2026-06-23).
 * Difere do discharge apenas no parágrafo Background (load/bound to vs discharge/loaded in).
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

const W = 130;
const H = 97;

function fmtVal(v: FieldValue | undefined, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function fmtNum(v: FieldValue | undefined, dec: number, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return v.toFixed(dec);
  return String(v);
}

export function buildDraftLoadingContent(
  input: Pick<BuilderInput, 'data' | 'photos'>,
): TipTapNode[] {
  const { data, photos } = input;
  const photoBySlot = new Map<string, (typeof photos)[number]>();
  for (const p of photos) {
    if (!photoBySlot.has(p.slotId)) photoBySlot.set(p.slotId, p);
  }

  const hasIntermediate = data['intermediate_date'] != null;

  // ── 1. Cover ─────────────────────────────────────────────────────────────

  const cover: TipTapNode[] = [
    heading(1, [text('DRAFT SURVEY REPORT')]),
    paragraph([
      text('Ref: '),
      text(fmtVal(data['ref']), [dataField('ref')]),
    ]),
    paragraph([
      text('Vessel: '),
      text(fmtVal(data['vessel_name']), [dataField('vessel_name')]),
      text('   Flag: '),
      text(fmtVal(data['flag']), [dataField('flag')]),
      text('   IMO: '),
      text(fmtVal(data['imo']), [dataField('imo')]),
    ]),
    paragraph([
      text('Port: '),
      text(fmtVal(data['port']), [dataField('port')]),
      text('   Date: '),
      text(fmtVal(data['final_date']), [dataField('final_date')]),
    ]),
    paragraph([]),
  ];

  // ── 2. Persons / Companies Contacted ─────────────────────────────────────

  const persons: TipTapNode[] = [
    heading(2, [text('Persons / Companies Contacted')]),
    paragraph([text('Client: '), text(fmtVal(data['client']), [dataField('client')])]),
    paragraph([text('Operator / Contact: '), text(fmtVal(data['operator']), [dataField('operator')])]),
    paragraph([text('Undersigned Surveyor: NAABSA Marine Surveyors')]),
    paragraph([
      text("Vessel's Command — Captain: "),
      text(fmtVal(data['captain']), [dataField('captain')]),
      text('  /  Chief Officer: '),
      text(fmtVal(data['chief_officer']), [dataField('chief_officer')]),
    ]),
    paragraph([]),
  ];

  // ── 3. Background ─────────────────────────────────────────────────────────

  const berthingVal = fmtVal(data['berthing_side']);
  const berthingText =
    berthingVal === 'Starboard'
      ? 'The vessel was berthed Starboard side from shore and Port side from the boat.'
      : berthingVal === 'Port Side'
        ? 'The vessel was berthed Port side from shore and Starboard side from the boat.'
        : `The vessel was berthed ${berthingVal} side.`;

  const background: TipTapNode[] = [
    heading(2, [text('Background')]),
    paragraph([
      text('At the request and appointment of Messrs. '),
      text(fmtVal(data['client']), [dataField('client')]),
      text(
        ', the undersigned surveyor of NAABSA Marine Surveyors proceeded to ',
      ),
      text(fmtVal(data['port']), [dataField('port')]),
      text(' Port, at '),
      text(fmtVal(data['terminal']), [dataField('terminal')]),
      text(', to carry out a Loading Draft Survey of the M.V. '),
      text(fmtVal(data['vessel_name']), [dataField('vessel_name')]),
      text('.'),
    ]),
    paragraph([
      text('She called '),
      text(fmtVal(data['port']), [dataField('port')]),
      text(' Port to load a cargo of '),
      text(fmtVal(data['cargo']), [dataField('cargo')]),
      text(' in bulk, bound to '),
      text(fmtVal(data['discharging_port']), [dataField('discharging_port')]),
      text('.'),
    ]),
    paragraph([text(berthingText)]),
    paragraph([]),
  ];

  // ── 4. Ship's Particulars ─────────────────────────────────────────────────

  const particulars: TipTapNode[] = [
    heading(2, [text("Ship's Particulars")]),
    dataTable({
      tableId: 'ships_particulars',
      headers: ['Item', 'Value'],
      rows: [
        ['Flag', fmtVal(data['flag'])],
        ['Port of Registry', fmtVal(data['register_port'])],
        ['Call Sign', fmtVal(data['call_sign'])],
        ['IMO Number', fmtVal(data['imo'])],
        ['Type', fmtVal(data['vessel_type'])],
        ['Delivered', fmtVal(data['delivered'])],
        ['LOA', `${fmtNum(data['loa'], 2)} m`],
        ['LBP', `${fmtNum(data['lbp'], 2)} m`],
        ['Depth Moulded', `${fmtNum(data['depth_moulded'], 2)} m`],
        ['Breadth Moulded', `${fmtNum(data['breadth_moulded'], 2)} m`],
        ['Net Tonnage', `${fmtNum(data['net_tonnage'], 0)} mt`],
        ['Gross Tonnage', `${fmtNum(data['gross_tonnage'], 0)} mt`],
        ['Summer DWT', `${fmtNum(data['summer_dwt'], 0)} mt`],
      ],
    }),
    paragraph([]),
  ];

  // ── 5. Initial Draft Survey ───────────────────────────────────────────────

  const initial: TipTapNode[] = [
    heading(2, [text('Initial Draft Survey')]),
    paragraph([
      text('Date: '),
      text(fmtVal(data['initial_date']), [dataField('initial_date')]),
      text('   From: '),
      text(fmtVal(data['initial_start']), [dataField('initial_start')]),
      text(' to: '),
      text(fmtVal(data['initial_end']), [dataField('initial_end')]),
    ]),
    dataTable({
      tableId: 'init_readings_summary',
      headers: ['Draft Mark', 'Means (m)', 'Mean corrected (m)'],
      rows: [
        ['Fwd', fmtNum(data['init_fwd_mean'], 3), fmtNum(data['init_fwd_corr'], 4)],
        ['Ms', fmtNum(data['init_mid_mean'], 3), fmtNum(data['init_mid_corr'], 4)],
        ['Aft', fmtNum(data['init_aft_mean'], 3), fmtNum(data['init_aft_corr'], 4)],
      ],
    }),
    dataTable({
      tableId: 'init_trim_heel',
      headers: ['Item', 'Observed', 'Corrected'],
      rows: [
        ['Trim', fmtNum(data['init_trim_obs'], 4), fmtNum(data['init_trim_corr'], 4)],
      ],
    }),
    paragraph([]),
  ];

  // ── 6. Intermediate Draft Survey (condicional) ────────────────────────────

  const intermediate: TipTapNode[] = hasIntermediate
    ? [
        heading(2, [text('Intermediate Draft Survey')]),
        paragraph([
          text('Date: '),
          text(fmtVal(data['intermediate_date']), [dataField('intermediate_date')]),
          text('   From: '),
          text(fmtVal(data['intermediate_start']), [dataField('intermediate_start')]),
          text(' to: '),
          text(fmtVal(data['intermediate_end']), [dataField('intermediate_end')]),
        ]),
        dataTable({
          tableId: 'int_readings_summary',
          headers: ['Draft Mark', 'Means (m)', 'Mean corrected (m)'],
          rows: [
            ['Fwd', fmtNum(data['int_fwd_mean'], 3), fmtNum(data['int_fwd_corr'], 4)],
            ['Ms', fmtNum(data['int_mid_mean'], 3), fmtNum(data['int_mid_corr'], 4)],
            ['Aft', fmtNum(data['int_aft_mean'], 3), fmtNum(data['int_aft_corr'], 4)],
          ],
        }),
        dataTable({
          tableId: 'int_trim_heel',
          headers: ['Item', 'Observed', 'Corrected'],
          rows: [
            ['Trim', fmtNum(data['int_trim_obs'], 4), fmtNum(data['int_trim_corr'], 4)],
          ],
        }),
        heading(3, [text('Figures — Intermediate')]),
        dataTable({
          tableId: 'int_figures',
          headers: ['', 'MT'],
          rows: [
            ['Shore Scale / BsL (Official)', fmtNum(data['int_fig_shore_scale'], 3)],
            ["NAABSA Surveyor's Figures", fmtNum(data['int_fig_naabsa'], 3)],
            ["Vessel's Figures", fmtNum(data['int_fig_vessel'], 3)],
            ['Difference (MT)', fmtNum(data['int_fig_diff_mt'], 3)],
            ['Difference (%)', fmtNum(data['int_fig_diff_pct'] != null && typeof data['int_fig_diff_pct'] === 'number'
              ? data['int_fig_diff_pct'] * 100 : null, 3)],
          ],
        }),
        paragraph([]),
      ]
    : [];

  // ── 7. Final Draft Survey ─────────────────────────────────────────────────

  const final_: TipTapNode[] = [
    heading(2, [text('Final Draft Survey')]),
    paragraph([
      text('Date: '),
      text(fmtVal(data['final_date']), [dataField('final_date')]),
      text('   From: '),
      text(fmtVal(data['final_start']), [dataField('final_start')]),
      text(' to: '),
      text(fmtVal(data['final_end']), [dataField('final_end')]),
    ]),
    dataTable({
      tableId: 'fin_readings_summary',
      headers: ['Draft Mark', 'Means (m)', 'Mean corrected (m)'],
      rows: [
        ['Fwd', fmtNum(data['fin_fwd_mean'], 3), fmtNum(data['fin_fwd_corr'], 4)],
        ['Ms', fmtNum(data['fin_mid_mean'], 3), fmtNum(data['fin_mid_corr'], 4)],
        ['Aft', fmtNum(data['fin_aft_mean'], 3), fmtNum(data['fin_aft_corr'], 4)],
      ],
    }),
    dataTable({
      tableId: 'fin_trim_heel',
      headers: ['Item', 'Observed', 'Corrected'],
      rows: [
        ['Trim', fmtNum(data['fin_trim_obs'], 4), fmtNum(data['fin_trim_corr'], 4)],
      ],
    }),
    heading(3, [text('Figures — Final')]),
    dataTable({
      tableId: 'fin_figures',
      headers: ['', 'MT'],
      rows: [
        ['Shore Scale (Official)', fmtNum(data['fin_fig_shore_scale'], 3)],
        ["NAABSA Surveyor's Figures", fmtNum(data['fin_fig_naabsa'], 3)],
        ["Vessel's Figures", fmtNum(data['fin_fig_vessel'], 3)],
        ['Difference (MT)', fmtNum(data['fin_fig_diff_mt'], 3)],
        ['Difference (%)', fmtNum(data['fin_fig_diff_pct'] != null && typeof data['fin_fig_diff_pct'] === 'number'
          ? data['fin_fig_diff_pct'] * 100 : null, 3)],
      ],
    }),
    paragraph([]),
  ];

  // ── 8. Photographic Report ────────────────────────────────────────────────

  function makePhotoFrame(slotId: string) {
    const p = photoBySlot.get(slotId);
    return photoFrame({
      slotId,
      photoId: p?.photoId ?? null,
      src: p?.src ?? null,
      widthMm: W,
      heightMm: H,
    });
  }

  const photoReport: TipTapNode[] = [
    heading(2, [text('Photographic Report')]),
    heading(3, [text('Initial')]),
    makePhotoFrame('photos_initial'),
    ...(hasIntermediate
      ? [heading(3, [text('Intermediate')]), makePhotoFrame('photos_intermediate')]
      : []),
    heading(3, [text('Final')]),
    makePhotoFrame('photos_final'),
    paragraph([]),
  ];

  // ── 9. Attachment ─────────────────────────────────────────────────────────

  const attachment: TipTapNode[] = [
    heading(2, [text('Attachment')]),
    paragraph([
      text(
        'Draft Survey Certificates issued by undersigned surveyor / by vessel / by Terminal\'s surveyor.',
      ),
    ]),
  ];

  return [
    ...cover,
    ...persons,
    ...background,
    ...particulars,
    ...initial,
    ...intermediate,
    ...final_,
    ...photoReport,
    ...attachment,
  ];
}
