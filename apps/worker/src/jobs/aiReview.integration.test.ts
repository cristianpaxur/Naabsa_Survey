import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { aiReview } from './aiReview';

const memory = vi.hoisted(() => ({
  row: {} as Record<string, any>,
  spec: {} as any,
  writes: [] as Record<string, any>[],
  readError: false,
  specError: false,
  persistError: false,
  auditCount: 0,
}));
vi.mock('../lib/supabase', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const filters: ((row: Record<string, any>) => boolean)[] = [];
      let patch: Record<string, any> | undefined;
      const get = (row: Record<string, any>, key: string) =>
        key.includes('->>')
          ? row[key.split('->>')[0]!]?.[key.split('->>')[1]!]
          : row[key];
      const result = async () => {
        if (table === 'report_specs')
          return {
            data: { spec: memory.spec },
            error: memory.specError ? { message: 'db unavailable' } : null,
          };
        if (table === 'audit_log') {
          memory.auditCount++;
          return { data: null, error: null };
        }
        if (!patch && memory.readError)
          return { data: null, error: { message: 'db unavailable' } };
        if (!filters.every((f) => f(memory.row)))
          return { data: null, error: null };
        if (patch?.ai_review?.status === 'done' && memory.persistError)
          return { data: null, error: { message: 'db unavailable' } };
        if (patch) {
          memory.writes.push(patch);
          Object.assign(memory.row, patch);
        }
        return { data: { ...memory.row }, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((r) => get(r, key) === value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push((r) => (get(r, key) ?? null) === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) => values.includes(get(r, key)));
          return query;
        },
        update: (value: Record<string, any>) => {
          patch = value;
          return query;
        },
        insert: () => query,
        single: result,
        maybeSingle: result,
        then: (resolve: (value: unknown) => unknown) => result().then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'synthetic');
  memory.writes = [];
  memory.readError = false;
  memory.specError = false;
  memory.persistError = false;
  memory.auditCount = 0;
  memory.row = {
    id: 'r1',
    spec_id: 's1',
    variant: null,
    status: 'in_review',
    data_revision: 2,
    extracted_data: { imo: '111' },
    extracted_number_formats: {},
    operator_overrides: { imo: '222' },
    operator_number_formats: {},
    extraction_issues: [],
    ai_review: { status: 'queued', runId: 'run-1' },
  };
  memory.spec = {
    report_type: 'draft_survey',
    source: {
      common: {
        fields: {
          imo: { type: 'string', label: 'IMO', cell: 'C17', section: 'Navio' },
        },
      },
      by_variant: {},
    },
    validations: [],
  };
});
afterEach(() => vi.unstubAllEnvs());
const payload = { reportId: 'r1', dataRevision: 2, runId: 'run-1' };
const transport =
  (text: string, during?: () => void): typeof fetch =>
  async () => {
    during?.();
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: text } }] }),
    } as Response;
  };
describe('job real aiReview com transporte/banco simulados', () => {
  it('resolve a precisão efetiva no prompt e nos snapshots running/done', async () => {
    memory.row.extracted_data = {
      operator_value: 81,
      excel_value: 12,
      spec_value: 3.14,
      default_value: 7,
    };
    memory.row.extracted_number_formats = { operator_value: 2, excel_value: 1 };
    memory.row.operator_overrides = { operator_value: 81 };
    memory.row.operator_number_formats = { operator_value: 4 };
    memory.spec.source.common.fields = {
      operator_value: {
        type: 'number',
        label: 'Operator',
        cell: 'A1',
        section: 'Values',
        decimals: 3,
      },
      excel_value: {
        type: 'number',
        label: 'Excel',
        cell: 'A2',
        section: 'Values',
        decimals: 3,
      },
      spec_value: {
        type: 'number',
        label: 'Spec',
        cell: 'A3',
        section: 'Values',
        decimals: 2,
      },
      default_value: {
        type: 'number',
        label: 'Default',
        cell: 'A4',
        section: 'Values',
      },
    };
    let prompt = '';
    const fetchFn: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: Array<{ text?: string }> }>;
      };
      prompt =
        body.messages.find(({ role }) => role === 'user')?.content[0]?.text ??
        '';
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '[]' } }] }),
      } as Response;
    };

    await aiReview(payload, { fetchFn, audit: async () => {} });

    expect(prompt).toContain(
      '"field":"operator_value","label":"Operator","type":"number","decimals":4,"display_value":"81.0000","value":81',
    );
    expect(prompt).toContain(
      '"field":"excel_value","label":"Excel","type":"number","decimals":1,"display_value":"12.0","value":12',
    );
    expect(prompt).toContain(
      '"field":"spec_value","label":"Spec","type":"number","decimals":2,"display_value":"3.14","value":3.14',
    );
    expect(prompt).toContain(
      '"field":"default_value","label":"Default","type":"number","display_value":"7","value":7',
    );
    const expectedFormats = {
      operator_value: 4,
      excel_value: 1,
      spec_value: 2,
    };
    expect(
      memory.writes.some(
        (write) =>
          write.ai_review?.status === 'running' &&
          JSON.stringify(write.ai_review.numberFormats) ===
            JSON.stringify(expectedFormats),
      ),
    ).toBe(true);
    expect(memory.row.ai_review).toMatchObject({
      status: 'done',
      numberFormats: expectedFormats,
    });
  });

  it('persiste origem AI, snapshot dos overrides e dependências', async () => {
    const extractionIssue = {
      field: 'imo',
      cell: 'C17',
      origin: 'extraction',
      level: 'warning',
      message: 'Aviso da extração',
    };
    memory.row.extraction_issues = [
      extractionIssue,
      {
        field: 'imo',
        cell: 'C17',
        origin: 'ai',
        level: 'warning',
        message: 'Aviso antigo da IA',
      },
    ];
    let issuesDuringCall: Record<string, any>[] = [];
    await aiReview(payload, {
      fetchFn: transport(
        '[{"field":"imo","message":"IMO suspeito","related_fields":["imo"]}]',
        () => {
          issuesDuringCall = structuredClone(memory.row.extraction_issues);
        },
      ),
      audit: async () => {},
    });
    expect(issuesDuringCall).toEqual([extractionIssue]);
    expect(memory.row.ai_review).toMatchObject({
      status: 'done',
      revision: 2,
      data: { imo: '222' },
      dependencies: { imo: ['imo'] },
    });
    expect(memory.row.extraction_issues).toEqual([
      extractionIssue,
      {
        field: 'imo',
        cell: 'C17',
        level: 'warning',
        message: 'IMO suspeito',
        origin: 'ai',
      },
    ]);
  });
  it('remove warning AI stale no snapshot running e não o ressuscita no error', async () => {
    const extractionIssue = {
      field: 'imo',
      cell: 'C17',
      origin: 'extraction',
      level: 'warning',
      message: 'Aviso da extração',
    };
    memory.row.extraction_issues = [
      extractionIssue,
      {
        field: 'imo',
        cell: 'C17',
        origin: 'ai',
        level: 'warning',
        message: 'Aviso antigo da IA',
      },
    ];
    memory.row.ai_review = {
      status: 'stale',
      data: { imo: '111' },
      dependencies: { imo: ['imo'] },
      numberFormats: {},
    };
    let issuesDuringCall: Record<string, any>[] = [];

    await aiReview(
      { reportId: 'r1', dataRevision: 2 },
      {
        fetchFn: transport('não é JSON', () => {
          issuesDuringCall = structuredClone(memory.row.extraction_issues);
        }),
        audit: async () => {},
      },
    );

    expect(issuesDuringCall).toEqual([extractionIssue]);
    expect(memory.row.extraction_issues).toEqual([extractionIssue]);
    expect(memory.row.ai_review.status).toBe('error');
  });
  it('sucesso vazio remove avisos antigos; JSON inválido registra erro', async () => {
    memory.row.extraction_issues = [
      { field: 'imo', origin: 'ai', level: 'warning', message: 'antigo' },
    ];
    await aiReview(payload, {
      fetchFn: transport('[]'),
      audit: async () => {},
    });
    expect(memory.row.ai_review.status).toBe('done');
    expect(memory.row.extraction_issues).toEqual([]);
    memory.row.ai_review = { status: 'queued', runId: 'run-1' };
    await aiReview(payload, {
      fetchFn: transport('não é JSON'),
      audit: async () => {},
    });
    expect(memory.row.ai_review).toMatchObject({
      status: 'error',
      numberFormats: {},
    });
  });
  it('não sobrescreve dados quando operador muda campo durante a chamada', async () => {
    await aiReview(payload, {
      fetchFn: transport('[{"field":"imo","message":"atrasado"}]', () => {
        memory.row.data_revision = 3;
        memory.row.operator_overrides = { imo: '333' };
        memory.row.ai_review = { status: 'stale' };
      }),
      audit: async () => {},
    });
    expect(memory.row.operator_overrides).toEqual({ imo: '333' });
    expect(memory.row.extraction_issues).toEqual([]);
    expect(memory.row.ai_review.status).toBe('stale');
  });
  it('não grava resposta depois do avanço de etapa nem repete job concluído', async () => {
    const fetchFn = vi.fn(
      transport('[]', () => {
        memory.row.status = 'editing';
      }),
    );
    await aiReview(payload, { fetchFn, audit: async () => {} });
    expect(
      memory.writes.filter((write) => write.ai_review?.status === 'done'),
    ).toHaveLength(0);
    const writesAfterStageAdvance = memory.writes.length;
    await aiReview(payload, { fetchFn, audit: async () => {} });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(memory.writes).toHaveLength(writesAfterStageAdvance);
  });
  it('worker registra IA desligada sem chamar provedor', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    const fetchFn = vi.fn();
    await aiReview(payload, { fetchFn });
    expect(memory.row.ai_review.status).toBe('disabled');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('retoma running do mesmo runId após interrupção e não repete publicação concluída', async () => {
    memory.row.ai_review = {
      status: 'running',
      runId: 'run-1',
      executionId: 'crashed-attempt',
      jobId: 'job-1',
      attempt: 0,
    };
    const fetchFn = vi.fn(transport('[]'));
    await aiReview(
      payload,
      { fetchFn, audit: async () => {} },
      { jobId: 'job-1', attempt: 1 },
    );
    expect(memory.row.ai_review.status).toBe('done');
    expect(memory.row.ai_review.executionId).not.toBe('crashed-attempt');
    await aiReview(
      payload,
      { fetchFn, audit: async () => {} },
      { jobId: 'job-1', attempt: 1 },
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(memory.auditCount).toBe(1);
  });
  it('tentativa expirada não publica nem duplica audit depois que a nova conclui', async () => {
    let started!: () => void;
    let finishOld!: (response: Response) => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const old = aiReview(
      payload,
      {
        fetchFn: () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
            started();
          }),
        audit: async () => {},
      },
      { jobId: 'job-1', attempt: 0 },
    );
    await entered;
    const oldExecutionId = memory.row.ai_review.executionId;
    await aiReview(
      payload,
      {
        fetchFn: transport('[{"field":"imo","message":"nova tentativa"}]'),
        audit: async () => {},
      },
      { jobId: 'job-1', attempt: 1 },
    );
    expect(memory.row.ai_review.executionId).not.toBe(oldExecutionId);
    finishOld({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '[{"field":"imo","message":"antiga tentativa"}]',
            },
          },
        ],
      }),
    } as Response);
    await old;
    expect(memory.row.extraction_issues).toMatchObject([
      { message: 'nova tentativa' },
    ]);
    expect(
      memory.writes.filter((p) => p.ai_review?.status === 'done'),
    ).toHaveLength(1);
    expect(memory.auditCount).toBe(1);
  });
  it('duplicata da mesma tentativa ou de outro job não chama IA nem assume a execução', async () => {
    memory.row.ai_review = {
      status: 'running',
      runId: 'run-1',
      executionId: 'owner',
      jobId: 'job-1',
      attempt: 0,
    };
    const fetchFn = vi.fn();
    await aiReview(payload, { fetchFn }, { jobId: 'job-1', attempt: 0 });
    await aiReview(payload, { fetchFn }, { jobId: 'other-job', attempt: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(memory.row.ai_review.executionId).toBe('owner');
  });
  it('erro na consulta e no spec propaga para retry; running é retomado após recuperação', async () => {
    memory.readError = true;
    await expect(aiReview(payload)).rejects.toThrow('consultar a revisão');
    memory.readError = false;
    memory.specError = true;
    memory.row.ai_review = {
      ...memory.row.ai_review,
      data: { imo: '222' },
      dependencies: { imo: ['imo'] },
      numberFormats: { summer_dwt: 4 },
    };
    await expect(aiReview(payload)).rejects.toThrow('consultar o spec');
    expect(memory.row.ai_review).toMatchObject({
      status: 'running',
      data: { imo: '222' },
      dependencies: { imo: ['imo'] },
      numberFormats: { summer_dwt: 4 },
    });
    memory.specError = false;
    await aiReview(payload, {
      fetchFn: transport('[]'),
      audit: async () => {},
    });
    expect(memory.row.ai_review.status).toBe('done');
  });
  it('falha ao persistir resultado não vira sucesso da fila e preserva retomada', async () => {
    memory.persistError = true;
    await expect(
      aiReview(payload, { fetchFn: transport('[]'), audit: async () => {} }),
    ).rejects.toThrow('persistir');
    expect(memory.row.ai_review.status).toBe('running');
    memory.persistError = false;
    await aiReview(payload, {
      fetchFn: transport('[]'),
      audit: async () => {},
    });
    expect(memory.row.ai_review.status).toBe('done');
    expect(memory.auditCount).toBe(1);
  });
});
