import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validate } from './validate';
import type { ReportSpec } from '../types';

const spec = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/specs/draft_survey.v1.json', import.meta.url), 'utf8')) as ReportSpec;
describe('limite percentual Draft Survey de 0,5%', () => {
  it.each([0.0049, 0.005, -0.0049, -0.005])('aceita a fração %s no limite', (value) => {
    expect(validate({ fin_fig_diff_pct: value }, spec, 'discharge').filter(i => i.field === 'fin_fig_diff_pct')).toEqual([]);
  });
  it.each([0.0051, -0.0051, 0.01, 0.049])('avisa para fração %s acima do limite', (value) => {
    expect(validate({ fin_fig_diff_pct: value }, spec, 'discharge').filter(i => i.field === 'fin_fig_diff_pct')).toHaveLength(1);
  });
});
