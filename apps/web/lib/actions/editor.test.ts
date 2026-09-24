import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approve, beginDocumentSave, confirmDocumentSave, getEditorUrl, getPdfStatus, reopenDocumentEditor, retryBuildWorkingDocx, retryGeneratePdf } from './editor';

const memory = vi.hoisted(() => ({
  row: {} as Record<string, unknown>, events: [] as { action: string; payload: unknown }[],
  beforeUpdate: undefined as (() => void) | undefined,
  beforeRead: undefined as (() => void) | undefined,
}));
const enqueuePdf = vi.hoisted(() => vi.fn());
const enqueueBuild = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queue', () => ({ enqueueGeneratePdf: enqueuePdf, enqueueBuildWorkingDocx: enqueueBuild, enqueuePreviewPdf: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ storage: {} }) }));
vi.mock('@/lib/wopi/token', () => ({ signToken: () => 'token', WOPI_TOKEN_TTL_SECONDS: 10 * 60 * 60 }));
vi.mock('@/lib/wopi/discovery', () => ({ getEditorUrlSrc: async () => 'https://office.test/edit?' }));
vi.mock('@/lib/audit', () => ({ audit: async (_client: unknown, event: { action: string; payload: unknown }) => { memory.events.unshift(event); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    let patch: Record<string, unknown> | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => { memory.beforeRead?.(); return { data: { ...memory.row }, error: null }; },
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'audit_log') return Promise.resolve(resolve({ data: memory.events }));
        memory.beforeUpdate?.();
        const matches = filters.every(([key, value]) => memory.row[key] === value);
        if (matches && patch) Object.assign(memory.row, patch);
        return Promise.resolve(resolve({ error: null, count: matches ? 1 : 0 }));
      },
    };
    return query;
  },
}) }));

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('WOPI_TOKEN_SECRET', 'test-editor-secret');
  memory.events = []; memory.beforeUpdate = undefined; memory.beforeRead = undefined;
  memory.row = { id: 'r1', status: 'editing', working_docx_path: 'r1/working/one.docx',
    working_docx_revision: 1, working_docx_generation: 'g1', approved_docx_revision: null, pdf_paths: [] };
  enqueuePdf.mockResolvedValue('job-pdf'); enqueueBuild.mockResolvedValue('job-build');
});
async function save(): Promise<string> {
  const request = await beginDocumentSave('r1');
  if (!('token' in request)) throw new Error('begin failed');
  memory.row.working_docx_revision = 2;
  memory.row.working_docx_path = 'r1/working/saved.docx';
  const result = await confirmDocumentSave('r1', request.token);
  if (!('receipt' in result)) throw new Error('confirm failed');
  return result.receipt;
}

describe('aprovação da versão salva e recuperação de filas', () => {
  it('informa ao Collabora a expiração futura do token WOPI', async () => {
    const result = await getEditorUrl('r1');
    if (!('url' in result)) throw new Error('editor URL ausente');
    const ttl = Number(new URL(result.url).searchParams.get('access_token_ttl'));
    expect(ttl).toBeGreaterThan(Date.now() + 9 * 60 * 60 * 1000);
  });
  it('servidor rejeita aprovação sem recibo e sem novo PutFile confirmado', async () => {
    expect(await approve('r1')).toHaveProperty('error');
    const request = await beginDocumentSave('r1');
    vi.useFakeTimers();
    const confirmation = confirmDocumentSave('r1', 'token' in request ? request.token : '');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await confirmation).toHaveProperty('error');
    vi.useRealTimers();
    expect(enqueuePdf).not.toHaveBeenCalled();
    expect(memory.row.status).toBe('editing');
  });
  it('aprova a revisão persistida e aponta snapshot para o mesmo objeto imutável', async () => {
    const receipt = await save();
    expect(await approve('r1', receipt)).toEqual({ ok: true });
    expect(memory.row).toMatchObject({ status: 'approved', approved_docx_path: 'r1/working/saved.docx', approved_docx_revision: 2 });
    expect(enqueuePdf).toHaveBeenCalledWith({ reportId: 'r1', approvedRevision: 2 });
  });
  it('documento sem modificações confirma a versão existente; mudança concorrente invalida', async () => {
    const request = await beginDocumentSave('r1');
    if (!('token' in request)) throw new Error('begin failed');
    expect(await confirmDocumentSave('r1', request.token, 'unmodified')).toHaveProperty('receipt');
    memory.row.working_docx_revision = 2;
    expect(await confirmDocumentSave('r1', request.token, 'unmodified')).toHaveProperty('error');
  });
  it('aguarda o PutFile terminar depois do Action_Save_Resp', async () => {
    const request = await beginDocumentSave('r1');
    if (!('token' in request)) throw new Error('begin failed');
    let reads = 0;
    memory.beforeRead = () => {
      reads += 1;
      if (reads === 2) {
        memory.row.working_docx_revision = 2;
        memory.row.working_docx_path = 'r1/working/delayed.docx';
      }
    };
    expect(await confirmDocumentSave('r1', request.token)).toHaveProperty('receipt');
    expect(reads).toBeGreaterThanOrEqual(2);
  });
  it('CAS rejeita edição concorrente à aprovação', async () => {
    const receipt = await save();
    memory.beforeUpdate = () => { memory.row.working_docx_revision = 3; memory.row.working_docx_path = 'r1/new.docx'; };
    expect(await approve('r1', receipt)).toHaveProperty('error');
    expect(memory.row.status).toBe('editing');
    expect(enqueuePdf).not.toHaveBeenCalled();
  });
  it('enqueue falho mantém aprovado, expõe falha e retry gera somente a revisão congelada', async () => {
    const receipt = await save();
    enqueuePdf.mockRejectedValueOnce(new Error('fila offline'));
    expect(await approve('r1', receipt)).toMatchObject({ approved: true });
    expect(await getPdfStatus('r1')).toMatchObject({
      status: 'approved',
      failed: true,
      failReason: 'Não foi possível iniciar o processamento. Tente novamente.',
    });
    expect(await retryGeneratePdf('r1')).toEqual({ ok: true });
    expect(enqueuePdf).toHaveBeenLastCalledWith({ reportId: 'r1', approvedRevision: 2 });
    expect(await getPdfStatus('r1')).toMatchObject({ failed: false });
  });
  it('relatório aprovado sem registro de job oferece recuperação', async () => {
    memory.row.status = 'approved';
    expect(await getPdfStatus('r1')).toMatchObject({ failed: true });
  });
  it('retry de montagem preserva documento válido e não envia outro build', async () => {
    expect(await retryBuildWorkingDocx('r1')).toEqual({ ok: true });
    expect(enqueueBuild).not.toHaveBeenCalled();
  });
  it('falha antes do job build aparece no editor; retry usa geração atual', async () => {
    memory.row.working_docx_path = null;
    enqueueBuild.mockRejectedValueOnce(new Error('fila offline'));
    expect(await retryBuildWorkingDocx('r1')).toHaveProperty('error');
    expect(await getEditorUrl('r1')).toMatchObject({ canRetry: true });
    expect(await retryBuildWorkingDocx('r1')).toEqual({ ok: true });
    expect(enqueueBuild).toHaveBeenLastCalledWith({ reportId: 'r1', generation: 'g1' }, { dedupe: false });
    expect(await getEditorUrl('r1')).toEqual({ pending: true });
  });
  it('retry do build orienta a corrigir a conexão sem expor credenciais', async () => {
    memory.row.working_docx_path = null;
    enqueueBuild.mockRejectedValueOnce(new Error('(ENOTFOUND) tenant/user postgres.gwxgqsqzaljuankvvubz not found'));
    expect(await retryBuildWorkingDocx('r1')).toEqual({
      error: 'A fila está indisponível. Verifique a conexão DATABASE_URL do web e do worker.',
    });
    expect(memory.events[0]).toMatchObject({
      action: 'working_docx_enqueue_failed',
      payload: { code: 'QUEUE_DATABASE_UNAVAILABLE' },
    });
    expect(memory.events[0].payload).not.toMatchObject({ message: expect.stringContaining('postgres.gwx') });
  });
  it('reabertura explícita libera lock órfão somente durante edição', async () => {
    memory.row.wopi_lock = 'lock-antigo';
    memory.row.wopi_lock_expires_at = '2099-01-01T00:00:00.000Z';
    expect(await reopenDocumentEditor('r1')).toEqual({ ok: true });
    expect(memory.row).toMatchObject({ wopi_lock: null, wopi_lock_expires_at: null });
    expect(memory.events[0]).toMatchObject({ action: 'wopi_lock_released' });

    memory.row.status = 'approved';
    memory.row.wopi_lock = 'lock-ativo';
    expect(await reopenDocumentEditor('r1')).toHaveProperty('error');
    expect(memory.row.wopi_lock).toBe('lock-ativo');
  });
});
