import { describe, expect, it } from 'vitest';
import {
  REPORT_STAGES,
  getReportStageState,
  type ReportStage,
} from './report-progress';

describe('progresso do relatório', () => {
  it('marca etapas anteriores como concluídas e a atual como ativa', () => {
    expect(getReportStageState('photos', 'review')).toBe('done');
    expect(getReportStageState('photos', 'photos')).toBe('current');
    expect(getReportStageState('photos', 'edit')).toBe('upcoming');
  });

  it('mantém a ordem completa do processo', () => {
    expect(REPORT_STAGES.map((stage) => stage.id)).toEqual<ReportStage[]>([
      'type',
      'spreadsheet',
      'review',
      'photos',
      'edit',
      'pdf',
    ]);
  });
});
