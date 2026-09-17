import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReviewStatus, setOverride, retryAiReview } from './review';

const memory = vi.hoisted(() => ({ user: true, row: {} as Record<string, any>, concurrent: false }));
const request = vi.hoisted(() => vi.fn(async () => {}));
const auditLog = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/request-ai-review', () => ({ requestAiReview: request }));
vi.mock('@/lib/audit', () => ({ audit: auditLog }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: memory.user ? { id: 'u1' } : null } }) },
  from: () => {
    const filters: [string, unknown][] = []; let patch: Record<string, any> | undefined;
    let projection = '';
    const result = async () => {
      if (patch && memory.concurrent) memory.row.data_revision++;
      if (!filters.every(([key, value]) => memory.row[key] === value)) return { data: null, error: null };
      if (patch) {
        Object.assign(memory.row, patch); memory.row.data_revision++;
        memory.row.ai_review = { ...memory.row.ai_review, status: 'stale' };
      }
      const columns = projection.split(',').map((column) => column.trim().split('!')[0]!);
      return { data: Object.fromEntries(columns.map((column) => [column, memory.row[column]])), error: null };
    };
    const query = { select: (columns: string) => { projection = columns; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      update: (value: Record<string, any>) => { patch = value; return query; },
      single: result, maybeSingle: result,
    }; return query;
  },
}) }));
beforeEach(() => {
  memory.user = true; memory.concurrent = false; request.mockClear(); auditLog.mockClear();
  memory.row = { id: 'r1', status: 'in_review', variant: null, data_revision: 2, extracted_data: { imo: '111', vessel: 'Alpha' }, operator_overrides: {},
    extracted_number_formats: { summer_dwt: 2 }, operator_number_formats: {},
    extraction_issues: [{ field: 'imo', origin: 'ai', level: 'warning', cell: 'C17', message: 'IMO suspeito' }],
    ai_review: { status: 'done', data: { imo: '111', vessel: 'Alpha' }, dependencies: { imo: ['imo'] } },
    report_specs: { spec: { source: { common: { fields: {
      imo: { type: 'string', label: 'IMO', cell: 'C17', section: 'Navio' }, vessel: { type: 'string', label: 'Navio', cell: 'C18', section: 'Navio' },
      summer_dwt: { type: 'number', label: 'Porte bruto', cell: 'D10', section: 'Navio', decimals: 3 },
    } }, by_variant: {} }, validations: [] } },
  };
});
describe('revisão integrada nas server actions', () => {
  it('salva número e casas juntos e audita alteração apenas de formato', async () => {
    memory.row.operator_overrides = { summer_dwt: 81 };
    memory.row.operator_number_formats = { summer_dwt: 2, outro: 4 };
    expect(await setOverride('r1', 'summer_dwt', 81, 1)).toMatchObject({ revision: 3, savedField: { value: 81, displayDecimals: 1, isOverride: true } });
    expect(memory.row.operator_overrides).toEqual({ summer_dwt: 81 });
    expect(memory.row.operator_number_formats).toEqual({ summer_dwt: 1, outro: 4 });
    expect(auditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      payload: expect.objectContaining({ before: 81, after: 81, beforeFormat: 2, afterFormat: 1 }),
    }));
  });

  it.each([0, 100])('preserva o limite válido de %i casas', async (decimals) => {
    expect(await setOverride('r1', 'summer_dwt', 81, decimals)).toMatchObject({ revision: 3 });
    expect(memory.row.operator_number_formats).toEqual({ summer_dwt: decimals });
  });

  it('limpar override remove precisão sem tocar no formato extraído', async () => {
    memory.row.operator_overrides = { summer_dwt: 81 };
    memory.row.extracted_data.summer_dwt = 80;
    memory.row.operator_number_formats = { summer_dwt: 1, outro: 4 };
    expect(await setOverride('r1', 'summer_dwt', null, undefined)).toMatchObject({ savedField: { value: 80, displayDecimals: 2, isOverride: false } });
    expect(memory.row.operator_overrides).toEqual({ summer_dwt: null });
    expect(memory.row.operator_number_formats).toEqual({ outro: 4 });
    expect(memory.row.extracted_number_formats).toEqual({ summer_dwt: 2 });
    expect(auditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      payload: expect.objectContaining({ beforeFormat: 1, afterFormat: null }),
    }));
  });

  it('edição sem precisão remove formato antigo para voltar ao fallback', async () => {
    memory.row.operator_number_formats = { summer_dwt: 1 };
    await setOverride('r1', 'summer_dwt', 82);
    expect(memory.row.operator_number_formats).toEqual({});
  });

  it.each([-1, 1.5, 101, NaN, Infinity, '2', null])('rejeita precisão inválida %s antes de salvar', async (decimals) => {
    expect(await setOverride('r1', 'summer_dwt', 81, decimals as number)).toHaveProperty('error');
    expect(memory.row.data_revision).toBe(2);
    expect(memory.row.operator_overrides).toEqual({});
    expect(memory.row.operator_number_formats).toEqual({});
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejeita precisão em campo textual', async () => {
    expect(await setOverride('r1', 'vessel', 'Beta', 2)).toHaveProperty('error');
    expect(memory.row.data_revision).toBe(2);
  });

  it.each(['81', NaN, Infinity, true])('rejeita valor não numérico ou não finito em campo number: %s', async (value) => {
    expect(await setOverride('r1', 'summer_dwt', value, 2)).toHaveProperty('error');
    expect(memory.row.data_revision).toBe(2);
  });

  it('conflito de revisão não persiste valor nem formato nem auditoria', async () => {
    memory.concurrent = true;
    expect(await setOverride('r1', 'summer_dwt', 81, 2)).toHaveProperty('error');
    expect(memory.row.operator_overrides).toEqual({});
    expect(memory.row.operator_number_formats).toEqual({});
    expect(auditLog).not.toHaveBeenCalled();
  });

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
