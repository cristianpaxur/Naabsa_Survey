import { describe, it, expect, vi } from 'vitest';
import { assembleDocument } from '../../lib/document-assembly';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/service', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ list: async () => ({ data: [] }) }) } }),
}));
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { PhotoFrame } from './nodes/photoFrame';
import { DataTable } from './nodes/dataTable';
import { LeaderLine } from './nodes/leaderLine';
import { SheetImage } from './nodes/sheetImage';
import { DataField } from './marks/dataField';
import { GlobalAnchor } from './globalAnchor';
import { LockGuard } from './lockGuard';
import { buildDraftSurvey } from '@naabsa/core';
import type { ReportSpec } from '@naabsa/core';

/**
 * Reproduz o caminho carregar→getJSON do editor (008) ao nível do schema
 * ProseMirror. Garante que os atributos dos nodes custom (dataTable.rows,
 * photoFrame.src, dataField.field) SOBREVIVEM ao round-trip — regressão do bug
 * que produzia tabelas/fotos vazias no PDF.
 */
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false }),
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  PhotoFrame,
  DataTable,
  LeaderLine,
  SheetImage,
  DataField,
  GlobalAnchor,
  LockGuard,
]);

function roundTrip(doc: unknown): unknown {
  const node = PMNode.fromJSON(schema, doc as Record<string, unknown>);
  return node.toJSON();
}

describe('Editor round-trip preserva atributos dos nodes custom', () => {
  it('preserva precisão efetiva da montagem real após round-trip', async () => {
    const spec = {
      report_type: 'draft_survey', version: 1,
      source: { sheet: 'Capa', common: { fields: {
        summer_dwt: { cell: 'A1', type: 'number', decimals: 3 },
        net_tonnage: { cell: 'A2', type: 'number', decimals: 3 },
        loa: { cell: 'A3', type: 'number', decimals: 3 },
      } }, by_variant: {} }, validations: [], photo_slots: [],
    } as unknown as ReportSpec;
    const query = {
      select: () => query, eq: () => query, is: () => query, not: () => query,
      order: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }),
    };
    const doc = await assembleDocument({ from: () => query } as never, 'r1', {
      slug: 'draft_survey', spec, variant: 'loading',
      extracted: { summer_dwt: 80, net_tonnage: 12000, loa: 228.9 },
      overrides: { summer_dwt: 81 },
      extractedNumberFormats: { summer_dwt: 0, net_tonnage: 0 },
      operatorNumberFormats: { summer_dwt: 1, net_tonnage: 2 },
    });
    const out = roundTrip(doc) as { content: { attrs?: Record<string, unknown> }[] };
    const table = out.content.find((node) => node.attrs?.tableId === 'ships_particulars');
    expect(table?.attrs?.rows).toEqual(expect.arrayContaining([
      ['Summer DWT', '81.0 mt'], ['Net tonnage', '12,000 mt'], ['LOA', '228.900 m'],
    ]));
  });

  it('dataTable preserva tableId/headers/rows', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'dataTable',
          attrs: {
            tableId: 'ships_particulars',
            headers: ['Item', 'Value'],
            rows: [
              ['Flag', 'PANAMA'],
              ['IMO Number', '9865324'],
            ],
          },
        },
      ],
    };
    const out = roundTrip(doc) as { content: { attrs?: Record<string, unknown> }[] };
    const table = out.content[0]!;
    expect(table.attrs?.tableId).toBe('ships_particulars');
    expect(table.attrs?.headers).toEqual(['Item', 'Value']);
    expect(table.attrs?.rows).toEqual([
      ['Flag', 'PANAMA'],
      ['IMO Number', '9865324'],
    ]);
  });

  it('photoFrame preserva slotId/photoId/src', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'photoFrame',
          attrs: {
            slotId: 'photos_initial',
            photoId: 'p1',
            src: 'reports/1/photo.jpg',
            widthMm: 130,
            heightMm: 97,
          },
        },
      ],
    };
    const out = roundTrip(doc) as { content: { attrs?: Record<string, unknown> }[] };
    const frame = out.content[0]!;
    expect(frame.attrs?.slotId).toBe('photos_initial');
    expect(frame.attrs?.src).toBe('reports/1/photo.jpg');
  });

  it('documento real do builder é aceito pelo schema do editor (sem text nodes vazios)', () => {
    // ProseMirror PROÍBE text nodes vazios — se o builder emitir text(''), o
    // editor quebra e renderiza em branco. Carregar o doc pelo schema lança
    // RangeError nesse caso. Cobre surveyor_name ausente (campo editável vazio).
    const minimalSpec = {
      report_type: 'draft_survey',
      version: 1,
      variants: ['loading', 'discharge'],
      source: { sheet: 'Capa', fingerprint: { cell: 'B2', expect: 'DRAFT SURVEY', sheet: 'Capa' }, common: { fields: {} }, by_variant: {} },
      validations: [],
      photo_slots: [],
    } as unknown as ReportSpec;

    for (const variant of ['loading', 'discharge'] as const) {
      const docJson = buildDraftSurvey({ spec: minimalSpec, variant, data: {}, tables: {}, photos: [] });
      // não deve lançar (text nodes vazios → RangeError)
      const node = PMNode.fromJSON(schema, docJson as unknown as Record<string, unknown>);
      expect(node.type.name).toBe('doc');
      expect(node.childCount).toBeGreaterThan(0);
    }
  });

  it('heading/paragraph preservam o atributo anchor (Contents/worker)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, anchor: 'background' }, content: [{ type: 'text', text: 'Background' }] },
        { type: 'paragraph', attrs: { anchor: 'initial-2' }, content: [{ type: 'text', text: 'Sea water density: x' }] },
      ],
    };
    const out = roundTrip(doc) as { content: { attrs?: Record<string, unknown> }[] };
    expect(out.content[0]!.attrs?.anchor).toBe('background');
    expect(out.content[1]!.attrs?.anchor).toBe('initial-2');
  });

  it('dataField (mark) preserva field', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'HG ANTWERP', marks: [{ type: 'dataField', attrs: { field: 'vessel_name' } }] },
          ],
        },
      ],
    };
    const out = roundTrip(doc) as {
      content: { content: { marks?: { attrs?: Record<string, unknown> }[] }[] }[];
    };
    const mark = out.content[0]!.content[0]!.marks![0]!;
    expect(mark.attrs?.field).toBe('vessel_name');
  });
});
