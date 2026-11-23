import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { confirmData, getReviewStatus, setOverride, retryAiReview } from './review';
import draftSurveySpec from '../../../../tests/fixtures/specs/draft_survey.v1.json';

const memory = vi.hoisted(() => ({ user: true, row: {} as Record<string, any>, concurrent: false }));
const request = vi.hoisted(() => vi.fn(async () => {}));
const auditLog = vi.hoisted(() => vi.fn(async () => {}));
const download = vi.hoisted(() => vi.fn());
vi.mock('@/lib/request-ai-review', () => ({ requestAiReview: request }));
vi.mock('@/lib/audit', () => ({ audit: auditLog }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ download }) } }),
}));
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
  download.mockReset();
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
  it('consulta O19 na planilha de um relatório antigo com o espelho C38 desatualizado', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Intermediario').getCell('O19').value = {
      formula: '1/0', result: { error: '#DIV/0!' },
    };
    const spreadsheet = await workbook.xlsx.writeBuffer();
    download.mockResolvedValue({ data: { arrayBuffer: async () => spreadsheet }, error: null });
    memory.row.report_specs.spec = draftSurveySpec;
    memory.row.spreadsheet_path = 'r1/spreadsheet.xlsx';
    memory.row.extracted_data = {
      vessel_name: 'MV Alpha', port: 'Santos', cargo: 'Grãos',
      initial_date: '2026-07-28', intermediate_date: '2026-07-27', final_date: '2026-07-30',
      int_fig_naabsa: 60000,
      int_fwd_mean: 0, int_mid_mean: 0, int_aft_mean: 0,
    };
    memory.row.extraction_issues = [
      { field: 'intermediate_date', cell: 'C5', level: 'warning', origin: 'ai', message: 'Data anterior à inicial' },
    ];
    memory.row.ai_review = null;

    expect(await getReviewStatus('r1')).toMatchObject({ issues: [] });
    expect(download).toHaveBeenCalledWith('r1/spreadsheet.xlsx');
    expect(await confirmData('r1')).toEqual({ ok: true });
  });

  it.each([true, false])('recupera os horários da planilha de um relatório antigo (snapshot da IA: %s)', async (hasSnapshot) => {
    const workbook = new ExcelJS.Workbook();
    const initial = workbook.addWorksheet('Inicial');
    initial.getCell('G7').value = { formula: 'TIME(0,0,0)', result: 0 };
    initial.getCell('H7').value = 10 / 24;
    workbook.addWorksheet('final').getCell('H5').value = 16 / 24;
    const spreadsheet = await workbook.xlsx.writeBuffer();
    download.mockResolvedValue({ data: { arrayBuffer: async () => spreadsheet }, error: null });

    const spec = structuredClone(draftSurveySpec);
    Object.assign(spec.source.common.fields.initial_start, { sheet: 'Capa', cell: 'M7' });
    Object.assign(spec.source.common.fields.initial_end, { sheet: 'Capa', cell: 'N7' });
    Object.assign(spec.source.common.fields.final_start, { sheet: 'Capa', cell: 'M9' });
    Object.assign(spec.source.common.fields.final_end, { sheet: 'Capa', cell: 'N9' });
    const extracted = {
      vessel_name: 'MV Alpha', port: 'Santos', cargo: 'Grãos',
      initial_date: '2026-11-01', final_date: '2026-11-03',
      initial_start: null, initial_end: '08:50', final_start: null, final_end: '16:00',
      intermediate_cargo_quantity: null,
    };
    const finalWarning = { field: 'final_start', cell: 'M9', level: 'warning', origin: 'ai', message: 'Início final ausente' };
    memory.row.report_specs.spec = spec;
    memory.row.spreadsheet_path = 'r1/spreadsheet.xlsx';
    memory.row.extracted_data = { ...extracted };
    memory.row.extraction_issues = [
      { field: 'initial_start', cell: 'M7', level: 'warning', origin: 'ai', message: 'Início inicial ausente' },
      finalWarning,
    ];
    memory.row.ai_review = { status: 'done', ...(hasSnapshot ? { data: extracted } : {}) };

    expect(await getReviewStatus('r1')).toMatchObject({ issues: [finalWarning] });
    expect(await setOverride('r1', 'initial_end', null)).toMatchObject({
      savedField: { value: '10:00', isOverride: false },
    });
    expect(await setOverride('r1', 'initial_start', '00:25')).toMatchObject({
      savedField: { value: '00:25', isOverride: true },
    });
    expect(memory.row.operator_overrides.initial_start).toBe('00:25');
    expect(await setOverride('r1', 'initial_start', null)).toMatchObject({
      savedField: { value: '00:00', isOverride: false },
    });
    expect(memory.row.extracted_data).toEqual(extracted);
  });

  it.each(['24:00', '09:60', '9:00', 0])('rejeita hora fora do formato HH:MM: %s', async (value) => {
    memory.row.report_specs.spec = draftSurveySpec;
    expect(await setOverride('r1', 'initial_start', value)).toHaveProperty('error');
    expect(memory.row.operator_overrides).toEqual({});
  });

  it('bloqueia cronologia inválida com carga intermediária mesmo com a IA desativada', async () => {
    memory.row.report_specs.spec = draftSurveySpec;
    memory.row.extracted_data = {
      vessel_name: 'MV Alpha', port: 'Santos', cargo: 'Grãos',
      initial_date: '2026-07-28', intermediate_date: '2026-07-27', final_date: '2026-07-30',
      intermediate_cargo_quantity: 60000,
      int_fwd_mean: 10, int_mid_mean: 11, int_aft_mean: 12,
    };
    memory.row.extraction_issues = [];
    memory.row.ai_review = { status: 'disabled' };

    expect(await getReviewStatus('r1')).toMatchObject({
      issues: [expect.objectContaining({ field: 'intermediate_date', level: 'error' })],
    });
    expect(await confirmData('r1')).toHaveProperty('error');
    expect(auditLog).not.toHaveBeenCalled();

    expect(await setOverride('r1', 'intermediate_date', '2026-07-28')).toMatchObject({ issues: [] });
    expect(await confirmData('r1')).toEqual({ ok: true });
  });

  it('salvar somente precisão invalida aviso dependente sem perder dígitos do valor', async () => {
    memory.row.extracted_data.summer_dwt = 81.2345;
    memory.row.ai_review = {
      status: 'done', data: { ...memory.row.extracted_data },
      numberFormats: { summer_dwt: 2 }, dependencies: { imo: ['summer_dwt'] },
    };
    expect(await setOverride('r1', 'summer_dwt', 81.2345, 3)).toMatchObject({
      issues: [], aiReview: { status: 'stale' }, revision: 3,
      savedField: { value: 81.2345, displayDecimals: 3, isOverride: true },
    });
    expect(await getReviewStatus('r1')).toMatchObject({ issues: [], aiReview: { status: 'stale' } });
    expect(memory.row.operator_overrides).toEqual({ summer_dwt: 81.2345 });
  });

  it.each([
    [{ summer_dwt: 81 }, { summer_dwt: 1 }, { summer_dwt: 2 }, 1, true],
    [{ summer_dwt: 81 }, { summer_dwt: 1 }, { summer_dwt: 2 }, 2, false],
    [{}, { summer_dwt: 1 }, { summer_dwt: 2 }, 2, true],
    [{ summer_dwt: null }, { summer_dwt: 1 }, { summer_dwt: 2 }, 2, true],
    [{}, {}, {}, 3, true],
    [{}, {}, {}, 2, false],
  ])('polling compara precisão efetiva de operador/Excel/spec para %j, %j, %j, snapshot=%i', async (overrides, operatorFormats, extractedFormats, snapshotDecimals, retained) => {
    memory.row.extracted_data.summer_dwt = 81;
    memory.row.operator_overrides = overrides;
    memory.row.operator_number_formats = operatorFormats;
    memory.row.extracted_number_formats = extractedFormats;
    memory.row.ai_review = {
      status: 'done', data: { ...memory.row.extracted_data },
      numberFormats: { summer_dwt: snapshotDecimals }, dependencies: { imo: ['summer_dwt'] },
    };
    const result = await getReviewStatus('r1');
    expect(result).toMatchObject({ issues: retained ? [memory.row.extraction_issues[0]] : [] });
  });

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
