import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { aiReview } from './aiReview';

const memory = vi.hoisted(() => ({ row: {} as Record<string, any>, spec: {} as any, writes: [] as Record<string, any>[], readError: false, specError: false, persistError: false, auditCount: 0 }));
vi.mock('../lib/supabase', () => ({ getServiceClient: () => ({
  from: (table: string) => {
    const filters: ((row: Record<string, any>) => boolean)[] = [];
    let patch: Record<string, any> | undefined;
    const get = (row: Record<string, any>, key: string) => key.includes('->>') ? row[key.split('->>')[0]!]?.[key.split('->>')[1]!] : row[key];
    const result = async () => {
      if (table === 'report_specs') return { data: { spec: memory.spec }, error: memory.specError ? { message: 'db unavailable' } : null };
      if (table === 'audit_log') { memory.auditCount++; return { data: null, error: null }; }
      if (!patch && memory.readError) return { data: null, error: { message: 'db unavailable' } };
      if (!filters.every((f) => f(memory.row))) return { data: null, error: null };
      if (patch?.ai_review?.status === 'done' && memory.persistError) return { data: null, error: { message: 'db unavailable' } };
      if (patch) { memory.writes.push(patch); Object.assign(memory.row, patch); }
      return { data: { ...memory.row }, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((r) => get(r, key) === value); return query; },
      is: (key: string, value: unknown) => { filters.push((r) => (get(r, key) ?? null) === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(get(r, key))); return query; },
      update: (value: Record<string, any>) => { patch = value; return query; },
      insert: () => query, single: result, maybeSingle: result,
      then: (resolve: (value: unknown) => unknown) => result().then(resolve),
    };
    return query;
  },
}) }));

beforeEach(() => {
  vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('AI_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'synthetic');
  memory.writes = [];
  memory.readError = false; memory.specError = false; memory.persistError = false; memory.auditCount = 0;
  memory.row = { id: 'r1', spec_id: 's1', variant: null, status: 'in_review', data_revision: 2,
    extracted_data: { imo: '111' }, operator_overrides: { imo: '222' }, extraction_issues: [], ai_review: { status: 'queued', runId: 'run-1' } };
  memory.spec = { report_type: 'draft_survey', source: { common: { fields: { imo: { type: 'string', label: 'IMO', cell: 'C17', section: 'Navio' } } }, by_variant: {} }, validations: [] };
});
afterEach(() => vi.unstubAllEnvs());
const payload = { reportId: 'r1', dataRevision: 2, runId: 'run-1' };
const transport = (text: string, during?: () => void): typeof fetch => async () => {
  during?.(); return { ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) } as Response;
};
describe('job real aiReview com transporte/banco simulados', () => {
  it('persiste origem AI, snapshot dos overrides e dependências', async () => {
    await aiReview(payload, { fetchFn: transport('[{"field":"imo","message":"IMO suspeito","related_fields":["imo"]}]'), audit: async () => {} });
    expect(memory.row.ai_review).toMatchObject({ status: 'done', revision: 2, data: { imo: '222' }, dependencies: { imo: ['imo'] } });
    expect(memory.row.extraction_issues).toMatchObject([{ field: 'imo', origin: 'ai' }]);
  });
  it('sucesso vazio remove avisos antigos; JSON inválido registra erro', async () => {
    memory.row.extraction_issues = [{ field: 'imo', origin: 'ai', level: 'warning', message: 'antigo' }];
    await aiReview(payload, { fetchFn: transport('[]'), audit: async () => {} });
    expect(memory.row.ai_review.status).toBe('done'); expect(memory.row.extraction_issues).toEqual([]);
    memory.row.ai_review = { status: 'queued', runId: 'run-1' };
    await aiReview(payload, { fetchFn: transport('não é JSON'), audit: async () => {} });
    expect(memory.row.ai_review.status).toBe('error');
  });
  it('não sobrescreve dados quando operador muda campo durante a chamada', async () => {
    await aiReview(payload, { fetchFn: transport('[{"field":"imo","message":"atrasado"}]', () => {
      memory.row.data_revision = 3; memory.row.operator_overrides = { imo: '333' }; memory.row.ai_review = { status: 'stale' };
    }), audit: async () => {} });
    expect(memory.row.operator_overrides).toEqual({ imo: '333' });
    expect(memory.row.extraction_issues).toEqual([]); expect(memory.row.ai_review.status).toBe('stale');
  });
  it('não grava resposta depois do avanço de etapa nem repete job concluído', async () => {
    const fetchFn = vi.fn(transport('[]', () => { memory.row.status = 'editing'; }));
    await aiReview(payload, { fetchFn, audit: async () => {} });
    expect(memory.writes).toHaveLength(1);
    await aiReview(payload, { fetchFn, audit: async () => {} });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('worker registra IA desligada sem chamar provedor', async () => {
    vi.stubEnv('AI_ENABLED', 'false'); const fetchFn = vi.fn();
    await aiReview(payload, { fetchFn });
    expect(memory.row.ai_review.status).toBe('disabled'); expect(fetchFn).not.toHaveBeenCalled();
  });
  it('retoma running do mesmo runId após interrupção e não repete publicação concluída', async () => {
    memory.row.ai_review = { status: 'running', runId: 'run-1', executionId: 'crashed-attempt', jobId: 'job-1', attempt: 0 };
    const fetchFn = vi.fn(transport('[]'));
    await aiReview(payload, { fetchFn, audit: async () => {} }, { jobId: 'job-1', attempt: 1 });
    expect(memory.row.ai_review.status).toBe('done');
    expect(memory.row.ai_review.executionId).not.toBe('crashed-attempt');
    await aiReview(payload, { fetchFn, audit: async () => {} }, { jobId: 'job-1', attempt: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1); expect(memory.auditCount).toBe(1);
  });
  it('tentativa expirada não publica nem duplica audit depois que a nova conclui', async () => {
    let started!: () => void;
    let finishOld!: (response: Response) => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const old = aiReview(payload, { fetchFn: () => new Promise<Response>((resolve) => { finishOld = resolve; started(); }), audit: async () => {} }, { jobId: 'job-1', attempt: 0 });
    await entered;
    const oldExecutionId = memory.row.ai_review.executionId;
    await aiReview(payload, { fetchFn: transport('[{"field":"imo","message":"nova tentativa"}]'), audit: async () => {} }, { jobId: 'job-1', attempt: 1 });
    expect(memory.row.ai_review.executionId).not.toBe(oldExecutionId);
    finishOld({ ok: true, json: async () => ({ choices: [{ message: { content: '[{"field":"imo","message":"antiga tentativa"}]' } }] }) } as Response);
    await old;
    expect(memory.row.extraction_issues).toMatchObject([{ message: 'nova tentativa' }]);
    expect(memory.writes.filter((p) => p.ai_review?.status === 'done')).toHaveLength(1);
    expect(memory.auditCount).toBe(1);
  });
  it('duplicata da mesma tentativa ou de outro job não chama IA nem assume a execução', async () => {
    memory.row.ai_review = { status: 'running', runId: 'run-1', executionId: 'owner', jobId: 'job-1', attempt: 0 };
    const fetchFn = vi.fn();
    await aiReview(payload, { fetchFn }, { jobId: 'job-1', attempt: 0 });
    await aiReview(payload, { fetchFn }, { jobId: 'other-job', attempt: 1 });
    expect(fetchFn).not.toHaveBeenCalled(); expect(memory.row.ai_review.executionId).toBe('owner');
  });
  it('erro na consulta e no spec propaga para retry; running é retomado após recuperação', async () => {
    memory.readError = true;
    await expect(aiReview(payload)).rejects.toThrow('consultar a revisão');
    memory.readError = false; memory.specError = true;
    await expect(aiReview(payload)).rejects.toThrow('consultar o spec');
    expect(memory.row.ai_review.status).toBe('running');
    memory.specError = false;
    await aiReview(payload, { fetchFn: transport('[]'), audit: async () => {} });
    expect(memory.row.ai_review.status).toBe('done');
  });
  it('falha ao persistir resultado não vira sucesso da fila e preserva retomada', async () => {
    memory.persistError = true;
    await expect(aiReview(payload, { fetchFn: transport('[]'), audit: async () => {} })).rejects.toThrow('persistir');
    expect(memory.row.ai_review.status).toBe('running');
    memory.persistError = false;
    await aiReview(payload, { fetchFn: transport('[]'), audit: async () => {} });
    expect(memory.row.ai_review.status).toBe('done'); expect(memory.auditCount).toBe(1);
  });
});
