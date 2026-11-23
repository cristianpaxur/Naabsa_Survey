import type { FieldValue, ReportSpec } from './types';

export const DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD = 'intermediate_cargo_quantity';

export function draftSurveyIntermediateCargoSource(
  spec: ReportSpec,
): { sheet: string; cell: string } | null {
  if (spec.report_type !== 'draft_survey') return null;
  const dateField = spec.source.common.fields['intermediate_date'];
  const sheet =
    spec.source.tables?.find((table) => table.id === 'int_draft_marks')?.sheet ??
    (dateField && (dateField.sheet ?? 'Intermediario'));
  return sheet ? { sheet, cell: 'O19' } : null;
}

export function draftSurveyIntermediateCargo(
  data: Record<string, FieldValue>,
): FieldValue {
  if (Object.hasOwn(data, DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD)) {
    return data[DRAFT_SURVEY_INTERMEDIATE_CARGO_FIELD] ?? null;
  }
  // Extrações antigas persistiam apenas o espelho de O19 em DS INTERMEDIATE!C38.
  return data['int_fig_naabsa'] ?? null;
}

export function hasDraftSurveyIntermediate(
  data: Record<string, FieldValue>,
): boolean {
  const cargo = draftSurveyIntermediateCargo(data);
  return typeof cargo === 'number' && Number.isFinite(cargo) && cargo !== 0;
}

export function isDraftSurveyIntermediateField(name: string): boolean {
  return name.startsWith('intermediate_') || name.startsWith('int_');
}
