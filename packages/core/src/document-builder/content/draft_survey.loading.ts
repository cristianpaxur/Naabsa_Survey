/**
 * ⚠️ CONTEÚDO PROVISÓRIO — derivado do protótipo de design (tela 07 Preview/PDF).
 * Substituir pelo texto real quando o cliente fornecer os modelos Word (PRD §15,
 * 004/T-011). Ao substituir, alterar APENAS este arquivo e atualizar snapshots.
 *
 * Variante: CARREGAMENTO
 */

import {
  type TipTapNode,
  text,
  paragraph,
  heading,
  dataField,
  dataTable,
  photoFrame,
  type PhotoFrameNode,
} from '../nodes';
import type { BuilderInput } from '../types';

const PHOTO_FRAME_WIDTH_MM = 150;
const PHOTO_FRAME_HEIGHT_MM = 112;

export function buildDraftLoadingContent(
  input: Pick<BuilderInput, 'data' | 'photos'>,
): TipTapNode[] {
  const { data, photos } = input;

  const photoBySlot = new Map(photos.map((p) => [p.slotId, p]));

  const header: TipTapNode[] = [
    heading(1, [text('NAABSA — RELATÓRIOS DE SURVEY')]),
    heading(2, [text('RELATÓRIO DE DRAFT SURVEY · CARREGAMENTO')]),
    paragraph([]),
  ];

  const identification: TipTapNode[] = [
    heading(3, [text('Identificação')]),
    paragraph([
      text('Navio: '),
      text(String(data['vessel_name'] ?? '—'), [dataField('vessel_name')]),
    ]),
    paragraph([
      text('Data do survey: '),
      text(String(data['survey_date'] ?? '—'), [dataField('survey_date')]),
    ]),
    paragraph([]),
  ];

  const operation: TipTapNode[] = [
    heading(3, [text('Operação')]),
    paragraph([
      text('Porto de carregamento: '),
      text(String(data['load_port'] ?? '—'), [dataField('load_port')]),
    ]),
    paragraph([]),
  ];

  const cargaTable = dataTable({
    tableId: 'carga_info',
    headers: ['Campo', 'Valor'],
    rows: [
      ['Peso de carga (t)', String(data['cargo_weight'] ?? '—')],
      ['Porões limpos', data['clean'] === true ? 'Sim' : data['clean'] === false ? 'Não' : '—'],
    ],
  });

  const cargo: TipTapNode[] = [
    heading(3, [text('Carga')]),
    cargaTable,
    paragraph([]),
  ];

  const calados: TipTapNode[] = [
    heading(3, [text('Calados')]),
    dataTable({
      tableId: 'draft_readings',
      headers: ['Leitura', 'Proa (m)', 'Meio (m)', 'Popa (m)'],
      rows: [
        ['Inicial', '—', '—', '—'],
        ['Final', '—', '—', '—'],
      ],
    }),
    paragraph([]),
  ];

  const fwdPhoto = photoBySlot.get('draft_fwd');
  const photoNodes: TipTapNode[] = [
    heading(3, [text('Fotos')]),
    photoFrame({
      slotId: 'draft_fwd',
      photoId: fwdPhoto?.photoId ?? null,
      src: fwdPhoto?.src ?? null,
      widthMm: PHOTO_FRAME_WIDTH_MM,
      heightMm: PHOTO_FRAME_HEIGHT_MM,
    } satisfies PhotoFrameNode['attrs']),
    paragraph([text('Calado de proa')]),
    paragraph([]),
  ];

  return [
    ...header,
    ...identification,
    ...operation,
    ...cargo,
    ...calados,
    ...photoNodes,
  ];
}
