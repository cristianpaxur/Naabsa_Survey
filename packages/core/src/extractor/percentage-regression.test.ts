import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validate } from './validate';
import type { ReportSpec } from '../types';

const spec = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/specs/draft_survey.v1.json', import.meta.url), 'utf8')) as ReportSpec;
describe('diferenças calculadas pelo Draft Survey', () => {
  const legacySpec = structuredClone(spec);
  legacySpec.source.common.fields.fin_fig_diff_mt!.min = 0;
  legacySpec.source.common.fields.fin_fig_diff_pct!.min = 0;
  legacySpec.validations = [
    ...(legacySpec.validations ?? []),
    {
      rule: 'range',
      field: 'fin_fig_diff_pct',
      min: -0.05,
      max: 0.05,
      level: 'warning',
      message: 'Regra legada que não deve mais ser aplicada.',
    },
  ];

  it.each([-0.231, 0.501, -1])(
    'ignora o percentual calculado %s mesmo com spec antiga',
    (value) => {
      expect(
        validate(
          { fin_fig_diff_pct: value },
          legacySpec,
          'discharge',
        ).filter((i) => i.field === 'fin_fig_diff_pct'),
      ).toEqual([]);
    },
  );
  it('ignora também a diferença calculada em MT', () => {
    expect(
      validate({ fin_fig_diff_mt: -152.596 }, legacySpec, 'discharge').filter(
        (i) => i.field === 'fin_fig_diff_mt',
      ),
    ).toEqual([]);
  });
});
