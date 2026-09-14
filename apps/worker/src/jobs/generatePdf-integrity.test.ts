import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePdf } from './generatePdf';

const state = vi.hoisted(() => ({
  report: {} as Record<string, unknown>, objects: new Map<string, Buffer>(), audits: [] as { action: string }[],
  failUpdate: false,
}));
const convert = vi.hoisted(() => vi.fn());
vi.mock('../lib/soffice', () => ({ convertDocxToPdf: convert, measureBookmarkPages: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getServiceClient: () => ({
  storage: { from: () => ({
    download: async (path: string) => ({ data: state.objects.has(path) ? { arrayBuffer: async () => state.objects.get(path) } : null, error: null }),
    upload: async (path: string, bytes: Buffer, opts: { upsert: boolean }) => {
      expect(opts.upsert).toBe(false);
      if (state.objects.has(path)) return { error: { message: 'The resource already exists', statusCode: '409' } };
      state.objects.set(path, bytes); return { error: null };
    },
  }) },
  from: () => {
    let patch: Record<string, unknown> | undefined;
    const filters: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      single: async () => ({ data: { ...state.report }, error: null }),
      insert: async (event: { action: string }) => { state.audits.push(event); return { error: null }; },
      update: (value: Record<string, unknown>) => { patch = value; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        if (state.failUpdate) return Promise.resolve(resolve({ error: { message: 'DB offline' }, count: null }));
        const matches = filters.every(([k, v]) => state.report[k] === v);
        if (matches && patch) Object.assign(state.report, patch);
        return Promise.resolve(resolve({ error: null, count: matches ? 1 : 0 }));
      },
    }; return q;
  },
}) }));

beforeEach(() => {
  vi.clearAllMocks(); state.failUpdate = false; state.objects.clear(); state.audits = [];
  state.report = { id: 'r1', status: 'approved', approved_docx_revision: 2, approved_docx_path: 'r1/saved-2.docx', pdf_paths: [], report_types: { slug: 'draft_survey' } };
  state.objects.set('r1/saved-2.docx', Buffer.from('MANUAL-2'));
  convert.mockImplementation(async (docx: Buffer) => Buffer.from(`PDF:${docx.toString()}`));
});

describe('generatePdf conserva a aprovação diante de retries e jobs atrasados', () => {
  it('duas execuções geram apenas um PDF referenciado sem reconstruir o DOCX', async () => {
    await generatePdf({ reportId: 'r1', approvedRevision: 2 });
    await generatePdf({ reportId: 'r1', approvedRevision: 2 });
    expect(state.report.status).toBe('generated');
    expect(state.report.pdf_paths).toEqual(['r1/final-v1-r2.pdf']);
    expect(state.objects.get('r1/final-v1-r2.pdf')?.toString()).toBe('PDF:MANUAL-2');
    expect(convert).toHaveBeenCalledOnce();
    expect(state.audits.filter(a => a.action === 'pdf_generated')).toHaveLength(1);
  });
  it('job de aprovação anterior ou sem revisão não converte o ciclo atual', async () => {
    await generatePdf({ reportId: 'r1', approvedRevision: 1 });
    await generatePdf({ reportId: 'r1' });
    expect(convert).not.toHaveBeenCalled();
  });
  it('mudança de ciclo durante conversão não publica PDF antigo nem ocupa nome do novo', async () => {
    convert.mockImplementationOnce(async () => {
      state.report.approved_docx_revision = 3; state.report.approved_docx_path = 'r1/saved-3.docx';
      state.objects.set('r1/saved-3.docx', Buffer.from('MANUAL-3')); return Buffer.from('OLD PDF');
    });
    await generatePdf({ reportId: 'r1', approvedRevision: 2 });
    expect(state.report.status).toBe('approved'); expect(state.report.pdf_paths).toEqual([]);
    await generatePdf({ reportId: 'r1', approvedRevision: 3 });
    expect(state.report.pdf_paths).toEqual(['r1/final-v1-r3.pdf']);
    expect(state.objects.get('r1/final-v1-r3.pdf')?.toString()).toBe('PDF:MANUAL-3');
  });
  it('retry após upload e falha DB reaproveita objeto sem duplicar versão', async () => {
    state.failUpdate = true;
    await expect(generatePdf({ reportId: 'r1', approvedRevision: 2 })).rejects.toThrow('DB offline');
    state.failUpdate = false;
    await generatePdf({ reportId: 'r1', approvedRevision: 2 });
    expect(state.report.pdf_paths).toEqual(['r1/final-v1-r2.pdf']);
    expect(state.objects.size).toBe(3);
  });
});
