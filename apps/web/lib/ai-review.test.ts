import { describe, expect, it } from 'vitest';
import { aiReviewLabel, mergeReviewIssues, type AiReviewState } from './ai-review';
import type { Issue } from '@naabsa/core';

const warning: Issue = { field: 'imo', cell: 'C17', level: 'warning', origin: 'ai', message: 'IMO suspeito' };
const state: AiReviewState = { status: 'done', data: { imo: '123', vessel: 'Alpha', flag: 'BR' }, dependencies: { imo: ['imo', 'flag'] } };
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
  it('separa falha, concluída vazia, desativada e fila atrasada', () => {
    expect(aiReviewLabel({ status: 'done' })).toContain('concluída');
    expect(aiReviewLabel({ status: 'error' })).toContain('não conseguiu');
    expect(aiReviewLabel({ status: 'disabled' })).toContain('desativada');
    expect(aiReviewLabel({ status: 'queued', updatedAt: '2026-01-01T00:00:00Z' })).toContain('2 minutos');
  });
});
