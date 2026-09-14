import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkingDocx } from './buildWorkingDocx';

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>, objects: new Map<string, Buffer>(),
  failDb: false, loseDbResponse: false,
}));
const assemble = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock('./generatePdf', () => ({
  loadReport: async () => ({ ...state.row }), buildWorkingDocx: (...args: unknown[]) => assemble(...args),
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
