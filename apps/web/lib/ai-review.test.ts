import { describe, expect, it } from 'vitest';
import { aiReviewLabel, mergeReviewIssues, type AiReviewState } from './ai-review';
import type { Issue, NumberFormatMap } from '@naabsa/core';

const warning: Issue = { field: 'imo', cell: 'C17', level: 'warning', origin: 'ai', message: 'IMO suspeito' };
const state: AiReviewState = { status: 'done', data: { imo: '123', vessel: 'Alpha', flag: 'BR' }, dependencies: { imo: ['imo', 'flag'] } };

describe('proveniência da precisão analisada pela IA', () => {
  const numericWarning: Issue = { field: 'dwt', cell: 'D10', level: 'warning', origin: 'ai', message: 'Precisão suspeita' };
  const data = { dwt: 81.2345, draft: 12, other: 5 };
  const snapshot: AiReviewState = {
    status: 'done', data, numberFormats: { dwt: 2, draft: 3 },
    dependencies: { dwt: ['draft'] },
  };

  it.each<NumberFormatMap>([
    { dwt: 3, draft: 3 },
    { dwt: 2, draft: 1 },
    { draft: 3 },
  ])('invalida aviso por mudança de formato %j', (formats) => {
    expect(mergeReviewIssues([], [numericWarning], data, {}, snapshot, formats)).toEqual([]);
  });

  it('invalida snapshot stale quando somente o formato mudou', () => {
    expect(mergeReviewIssues([], [numericWarning], data, {}, { ...snapshot, status: 'stale' }, { dwt: 3, draft: 3 })).toEqual([]);
  });

  it('preserva aviso com formatos iguais e mudança em formato não relacionado', () => {
    expect(mergeReviewIssues([], [numericWarning], data, {}, snapshot, { dwt: 2, draft: 3, other: 1 })).toEqual([numericWarning]);
  });

  it('formato igual não permite reutilizar dependência com valor diferente', () => {
    expect(mergeReviewIssues([], [numericWarning], { ...data, draft: 13 }, {}, snapshot, { dwt: 2, draft: 3 })).toEqual([]);
  });

  it('snapshot com mapa vazio registra a representação padrão e detecta nova precisão', () => {
    expect(mergeReviewIssues([], [numericWarning], data, {}, { ...snapshot, numberFormats: {} }, { dwt: 2 })).toEqual([]);
    expect(mergeReviewIssues([], [numericWarning], data, {}, { ...snapshot, numberFormats: {} }, {})).toEqual([numericWarning]);
  });

  it('snapshot legado sem numberFormats mantém comparação apenas de valores', () => {
    const legacy: AiReviewState = { status: 'done', data, dependencies: { dwt: ['draft'] } };
    expect(mergeReviewIssues([], [numericWarning], data, {}, legacy, { dwt: 3, draft: 1 })).toEqual([numericWarning]);
    expect(mergeReviewIssues([], [numericWarning], { ...data, draft: 13 }, {}, legacy, { dwt: 3 })).toEqual([]);
  });
});
describe('avisos persistidos e versão dos dados', () => {
  it('exibe aviso legado e deduplica resultados repetidos', () => {
    expect(mergeReviewIssues([], [warning, warning], { imo: '123' }, { imo: '123' }, null)).toEqual([warning]);
  });
  it('preserva aviso quando somente um campo não relacionado muda', () => {
    expect(mergeReviewIssues([], [warning], { imo: '123', vessel: 'Beta', flag: 'BR' }, {}, state)).toEqual([warning]);
  });
  it('invalida quando o campo ou uma dependência muda', () => {
    expect(mergeReviewIssues([], [warning], { imo: '456', flag: 'BR' }, {}, state)).toEqual([]);
    expect(mergeReviewIssues([], [warning], { imo: '123', flag: 'US' }, {}, state)).toEqual([]);
  });
  it.each(['int_fig_diff_mt', 'int_fig_diff_pct', 'fin_fig_diff_mt', 'fin_fig_diff_pct'])(
    'oculta aviso legado do campo calculado %s',
    (field) => {
      const calculated = { ...warning, field };
      expect(
        mergeReviewIssues(
          [],
          [calculated],
          { [field]: -0.231 },
          { [field]: -0.231 },
          null,
        ),
      ).toEqual([]);
    },
  );
  it('separa falha, concluída vazia, desativada e fila atrasada', () => {
    expect(aiReviewLabel({ status: 'done' })).toContain('concluída');
    expect(aiReviewLabel({ status: 'error' })).toContain('não conseguiu');
    expect(aiReviewLabel({ status: 'disabled' })).toContain('desativada');
    expect(aiReviewLabel({ status: 'queued', updatedAt: '2026-01-01T00:00:00Z' })).toContain('2 minutos');
  });
});
