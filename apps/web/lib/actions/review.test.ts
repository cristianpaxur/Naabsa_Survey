import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReviewStatus, setOverride, retryAiReview } from './review';

const memory = vi.hoisted(() => ({ user: true, row: {} as Record<string, any>, concurrent: false }));
const request = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/request-ai-review', () => ({ requestAiReview: request }));
vi.mock('@/lib/audit', () => ({ audit: async () => {} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: memory.user ? { id: 'u1' } : null } }) },
  from: () => {
    const filters: [string, unknown][] = []; let patch: Record<string, any> | undefined;
    const result = async () => {
      if (patch && memory.concurrent) memory.row.data_revision++;
      if (!filters.every(([key, value]) => memory.row[key] === value)) return { data: null, error: null };
      if (patch) {
        Object.assign(memory.row, patch); memory.row.data_revision++;
        memory.row.ai_review = { ...memory.row.ai_review, status: 'stale' };
      }
      return { data: { ...memory.row }, error: null };
    };
    const query = { select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      update: (value: Record<string, any>) => { patch = value; return query; },
      single: result, maybeSingle: result,
    }; return query;
  },
}) }));
beforeEach(() => {
  memory.user = true; memory.concurrent = false; request.mockClear();
  memory.row = { id: 'r1', status: 'in_review', variant: null, data_revision: 2, extracted_data: { imo: '111', vessel: 'Alpha' }, operator_overrides: {},
    extraction_issues: [{ field: 'imo', origin: 'ai', level: 'warning', cell: 'C17', message: 'IMO suspeito' }],
    ai_review: { status: 'done', data: { imo: '111', vessel: 'Alpha' }, dependencies: { imo: ['imo'] } },
    report_specs: { spec: { source: { common: { fields: {
      imo: { type: 'string', label: 'IMO', cell: 'C17', section: 'Navio' }, vessel: { type: 'string', label: 'Navio', cell: 'C18', section: 'Navio' },
    } }, by_variant: {} }, validations: [] } },
  };
});
describe('revisão integrada nas server actions', () => {
  it('consulta de polling retorna avisos já persistidos sem depender de novo job', async () => {
    expect(await getReviewStatus('r1')).toMatchObject({ issues: [{ origin: 'ai', message: 'IMO suspeito' }], aiReview: { status: 'done' }, revision: 2 });
  });
  it('edição não relacionada preserva aviso; edição do próprio dado o invalida', async () => {
    expect(await setOverride('r1', 'vessel', 'Beta')).toMatchObject({ issues: [{ origin: 'ai' }], revision: 3 });
    expect(await setOverride('r1', 'imo', '222')).toMatchObject({ issues: [], revision: 4 });
  });
  it('mudança concorrente não é sobrescrita; sessão expirada não dispara IA', async () => {
    memory.concurrent = true;
    expect(await setOverride('r1', 'imo', '222')).toHaveProperty('error');
    expect(memory.row.operator_overrides).toEqual({});
    memory.user = false;
    expect(await retryAiReview('r1')).toHaveProperty('error'); expect(request).not.toHaveBeenCalled();
  });
});
