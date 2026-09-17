import { describe, it, expect } from 'vitest';
import { aiWarningsToIssues, buildReviewPrompt } from './aiReview';
import type { ReportSpec } from '@naabsa/core';

const cellOf = (f: string) => (f === 'imo' ? 'C17' : null);
const valid = new Set(['imo', 'flag']);

describe('aiWarningsToIssues (010/T-007)', () => {
  it('converte warning de campo válido em Issue origem ai (com célula)', () => {
    const out = aiWarningsToIssues([{ field: 'imo', message: 'IMO improvável' }], valid, cellOf);
    expect(out).toEqual([{ field: 'imo', cell: 'C17', level: 'warning', message: 'IMO improvável', origin: 'ai' }]);
  });

  it('descarta campo inexistente (alucinação)', () => {
    const out = aiWarningsToIssues([{ field: 'inexistente', message: 'x' }], valid, cellOf);
    expect(out).toHaveLength(0);
  });

  it('ignora entradas malformadas e não-array', () => {
    expect(aiWarningsToIssues([{ field: 'imo' }, { message: 'só msg' }, null, 42], valid, cellOf)).toHaveLength(0);
    expect(aiWarningsToIssues(null, valid, cellOf)).toHaveLength(0);
    expect(aiWarningsToIssues('nope', valid, cellOf)).toHaveLength(0);
  });

  it('trunca mensagens longas em 300 chars', () => {
    const long = 'a'.repeat(500);
    const out = aiWarningsToIssues([{ field: 'flag', message: long }], valid, cellOf);
    expect(out[0]!.message.length).toBe(300);
  });
});

describe('buildReviewPrompt (010/T-007)', () => {
  const spec = {
    report_type: 'draft_survey',
    version: 1,
    variants: ['loading'],
    source: {
      fingerprint: { cell: 'B2', expect: 'X' },
      common: {
        fields: {
          imo: { type: 'string', cell: 'C17', label: 'IMO', section: 'Particulars' },
          loa: { type: 'number', cell: 'C20', label: 'LOA', section: 'Particulars', unit: 'm', min: 50, max: 400 },
          summer_dwt: { type: 'number', cell: 'C26', label: 'Summer DWT', section: 'Particulars', unit: 'mt', decimals: 1 },
          fin_fig_diff_mt: { type: 'number', cell: 'C39', label: 'Diferença (MT)', section: 'Figures', unit: 'MT', decimals: 3, ai_review: false },
          fin_fig_diff_pct: { type: 'number', cell: 'C40', label: 'Diferença (%)', section: 'Figures', unit: '%', decimals: 3 },
        },
      },
      by_variant: {},
    },
    validations: [],
    photo_slots: [],
  } as unknown as ReportSpec;

  it('inclui campos, valores e instrução de array JSON', () => {
    const { system, userText } = buildReviewPrompt(spec, 'loading', { imo: '9544073', loa: 999, summer_dwt: 81 });
    expect(system).toContain('Draft Survey');
    expect(system).toContain('milhares de toneladas');
    expect(userText).toContain('"field":"imo"');
    expect(userText).toContain('"value":"9544073"');
    expect(userText).toContain('"min":50');
    expect(userText).toContain('"display_value":"81.000"');
    expect(userText).toContain('"decimals":3');
    expect(userText).not.toContain('fin_fig_diff_mt');
    expect(userText).not.toContain('fin_fig_diff_pct');
    expect(userText).toMatch(/array JSON/i);
  });
});
