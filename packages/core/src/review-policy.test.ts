import { describe, expect, it } from 'vitest';
import {
  displayDecimalsForField,
  isCalculatedDifferenceField,
} from './review-policy';

describe('política de revisão do Draft Survey', () => {
  it.each([
    'int_fig_diff_mt',
    'int_fig_diff_pct',
    'fin_fig_diff_mt',
    'fin_fig_diff_pct',
  ])('ignora o campo calculado %s', (field) => {
    expect(isCalculatedDifferenceField(field)).toBe(true);
  });

  it('mantém campos de origem revisáveis', () => {
    expect(isCalculatedDifferenceField('fin_fig_naabsa')).toBe(false);
  });

  it.each(['net_tonnage', 'gross_tonnage', 'summer_dwt'])(
    'exibe %s com três casas decimais mesmo em specs antigas',
    (field) => {
      expect(displayDecimalsForField(field, 0)).toBe(3);
    },
  );
});
