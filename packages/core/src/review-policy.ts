/** Campos calculados pela própria planilha e que não devem gerar avisos. */
const CALCULATED_DIFFERENCE_FIELDS = new Set([
  'int_fig_diff_mt',
  'int_fig_diff_pct',
  'fin_fig_diff_mt',
  'fin_fig_diff_pct',
]);

/** Tonelagens exibidas com a precisão usada pela planilha do cliente. */
const TONNAGE_FIELDS = new Set(['net_tonnage', 'gross_tonnage', 'summer_dwt']);

export function isCalculatedDifferenceField(field: string): boolean {
  return CALCULATED_DIFFERENCE_FIELDS.has(field);
}

export function displayDecimalsForField(
  field: string,
  configured?: number,
): number | undefined {
  return TONNAGE_FIELDS.has(field) ? 3 : configured;
}
