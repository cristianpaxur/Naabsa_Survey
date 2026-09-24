export type ReportStage =
  | 'type'
  | 'spreadsheet'
  | 'review'
  | 'photos'
  | 'edit'
  | 'pdf';

export const REPORT_STAGES: ReadonlyArray<{ id: ReportStage; label: string }> =
  [
    { id: 'type', label: 'Tipo' },
    { id: 'spreadsheet', label: 'Planilha' },
    { id: 'review', label: 'Revisão' },
    { id: 'photos', label: 'Fotos' },
    { id: 'edit', label: 'Edição' },
    { id: 'pdf', label: 'PDF' },
  ];

export type ReportStageState = 'done' | 'current' | 'upcoming';

export function getReportStageState(
  current: ReportStage,
  stage: ReportStage,
): ReportStageState {
  const currentIndex = REPORT_STAGES.findIndex(({ id }) => id === current);
  const stageIndex = REPORT_STAGES.findIndex(({ id }) => id === stage);
  if (stageIndex < currentIndex) return 'done';
  if (stageIndex === currentIndex) return 'current';
  return 'upcoming';
}
