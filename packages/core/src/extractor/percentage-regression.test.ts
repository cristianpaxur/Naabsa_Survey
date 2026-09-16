import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validate } from './validate';
import type { ReportSpec } from '../types';

const spec = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/specs/draft_survey.v1.json', import.meta.url), 'utf8')) as ReportSpec;
describe('limite percentual Draft Survey de 0,5 pontos percentuais', () => {
  it.each([0.499, 0.5, -0.231, -0.499, -0.5])('aceita o percentual %s no limite', (value) => {
    expect(validate({ fin_fig_diff_pct: value }, spec, 'discharge').filter(i => i.field === 'fin_fig_diff_pct')).toEqual([]);
  });
  it.each([0.501, -0.501, 1, -1])('avisa para percentual %s fora do limite', (value) => {
    expect(validate({ fin_fig_diff_pct: value }, spec, 'discharge').filter(i => i.field === 'fin_fig_diff_pct')).toHaveLength(1);
  });
});
