import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkingDocx } from './buildWorkingDocx';
import PizZip from 'pizzip';

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>, objects: new Map<string, Buffer>(),
  failDb: false, loseDbResponse: false,
}));
const assemble = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock('./generatePdf', () => ({
  loadReport: async () => ({ ...state.row }), buildWorkingDocx: (...args: unknown[]) => assemble(...args),
}));
vi.mock('../lib/soffice', () => ({
  measureBookmarkPages: async () => ({}),
  convertDocxToPdf: async () => Buffer.from('PDF'),
}));
vi.mock('../lib/documentLayoutQa', () => ({
  validateDocumentLayout: async () => ({ ok: true, pageCount: 1, blankPages: [], aiRequestedSmallerPhotos: false }),
}));
vi.mock('../lib/supabase', () => ({ getServiceClient: () => ({
  storage: { from: () => ({ upload }) },
  from: () => ({
    insert: async () => ({ error: null }),
    update: (patch: Record<string, unknown>) => {
      const filters: [string, unknown][] = [];
      const query = {
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (state.failDb) return Promise.resolve(resolve({ error: { message: 'offline' }, count: 0 }));
          const matches = filters.every(([key, value]) => state.row[key] === value);
          if (matches) Object.assign(state.row, patch);
          return Promise.resolve(resolve({ error: state.loseDbResponse ? { message: 'resposta perdida' } : null, count: matches ? 1 : 0 }));
        },
      };
      return query;
    },
  }),
}) }));

// Carrega as dependências do builder na coleta, fora do orçamento de cada teste.
const realAssembly = await vi.importActual<typeof import('./generatePdf')>('./generatePdf');

beforeEach(() => {
  vi.clearAllMocks(); state.objects.clear(); state.failDb = false; state.loseDbResponse = false;
  state.row = { id: 'r1', status: 'editing', working_docx_generation: 'g1', working_docx_revision: 0, working_docx_path: null };
  assemble.mockResolvedValue({ docx: Buffer.from('INITIAL') });
  upload.mockImplementation(async (path: string, bytes: Buffer, options: { upsert: boolean }) => {
    if (options.upsert) throw new Error('Não pode sobrescrever objetos');
    state.objects.set(path, bytes); return { error: null };
  });
});

describe('montagem inicial com CAS', () => {
  it('publica DOCX real com a precisão efetiva carregada no relatório', async () => {
    Object.assign(state.row, {
      type_slug: 'draft_survey', variant: 'loading', spec_id: 's1', spreadsheet_path: null,
      extracted_data: { delivered: 1980, summer_dwt: 81 }, operator_overrides: { delivered: 1981 },
      extracted_number_formats: { delivered: 0, summer_dwt: 0 }, operator_number_formats: { delivered: 1 },
    });
    const spec = { report_type: 'draft_survey', version: 1, source: { sheet: 'Capa',
      common: { fields: { delivered: { cell: 'A1', type: 'number', decimals: 0 },
        summer_dwt: { cell: 'A2', type: 'number', decimals: 3 } } }, by_variant: {},
    }, validations: [], photo_slots: [] };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==', 'base64');
    const source = {
      from: (table: string) => {
        const query = {
          select: () => query, eq: () => query, is: () => query, not: () => query,
          single: async () => ({ data: table === 'report_specs' ? { spec } : null }),
          order: async () => ({ data: [] }),
        };
        return query;
      },
      storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => png }, error: null }) }) },
    };
    assemble.mockImplementation((_svc, reportId, row) => realAssembly.buildWorkingDocx(source as never, reportId, row));
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    const published = state.objects.get(state.row.working_docx_path as string)!;
    const xml = new PizZip(published).file('word/document.xml')!.asText();
    const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1]);
    expect(text.filter((value) => /^1981(?:\.\d+)?$/.test(value!))).toEqual(['1981.0']);
    const tonnageRow = (xml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? [])
      .find((row) => row.includes('Summer DWT'))!;
    const tonnageText = [...tonnageRow.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1]).join('');
    expect(tonnageText.match(/81(?:\.\d+)?/g)).toEqual(['81']);
    expect(state.row.working_docx_revision).toBe(1);
  });

  it('publica uma vez; execução repetida preserva edições humanas', async () => {
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    const path = state.row.working_docx_path as string;
    state.objects.set(path, Buffer.from('MANUAL'));
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    expect(assemble).toHaveBeenCalledOnce();
    expect(state.objects.get(path)?.toString()).toBe('MANUAL');
    expect(state.row.working_docx_revision).toBe(1);
  });
  it.each(['approved', 'generated'])('não toca relatório %s', async (status) => {
    state.row.status = status;
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    expect(upload).not.toHaveBeenCalled();
  });
  it('não executa job antigo nem job legado sem geração', async () => {
    await buildWorkingDocx({ reportId: 'r1', generation: 'g0' });
    await buildWorkingDocx({ reportId: 'r1' });
    expect(assemble).not.toHaveBeenCalled();
  });
  it.each(['approval', 'manual', 'new-generation'])('CAS protege mudança durante montagem: %s', async (change) => {
    assemble.mockImplementation(async () => {
      if (change === 'approval') state.row.status = 'approved';
      if (change === 'manual') { state.row.working_docx_path = 'manual.docx'; state.row.working_docx_revision = 3; }
      if (change === 'new-generation') state.row.working_docx_generation = 'g2';
      return { docx: Buffer.from('LATE') };
    });
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    expect(state.row.working_docx_path).toBe(change === 'manual' ? 'manual.docx' : null);
  });
  it('upload seguido de erro de banco permite retry sem sobrescrever bytes anteriores', async () => {
    state.failDb = true;
    await expect(buildWorkingDocx({ reportId: 'r1', generation: 'g1' })).rejects.toThrow('offline');
    state.failDb = false;
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    expect(state.objects.size).toBe(2);
    expect(state.objects.get(state.row.working_docx_path as string)?.toString()).toBe('INITIAL');
  });
  it('commit com resposta perdida não refaz documento publicado no retry', async () => {
    state.loseDbResponse = true;
    await expect(buildWorkingDocx({ reportId: 'r1', generation: 'g1' })).rejects.toThrow('resposta perdida');
    state.loseDbResponse = false;
    await buildWorkingDocx({ reportId: 'r1', generation: 'g1' });
    expect(assemble).toHaveBeenCalledOnce();
    expect(state.objects.size).toBe(1);
  });
  it('falha Storage não publica caminho inexistente', async () => {
    upload.mockResolvedValue({ error: { message: 'Storage offline' } });
    await expect(buildWorkingDocx({ reportId: 'r1', generation: 'g1' })).rejects.toThrow('falha no upload');
    expect(state.row.working_docx_path).toBeNull();
  });
});
