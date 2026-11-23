export const DRAFT_SURVEY_SHEET_PHASES = [
  'initial',
  'intermediate',
  'final',
] as const;

export type DraftSurveySheetPhase = (typeof DRAFT_SURVEY_SHEET_PHASES)[number];

export function draftSurveySheetImagePath(
  reportId: string,
  phase: DraftSurveySheetPhase,
): string {
  // Invalidate images generated before the header date and time fix.
  return `${reportId}/sheets/${phase}-v2.png`;
}
