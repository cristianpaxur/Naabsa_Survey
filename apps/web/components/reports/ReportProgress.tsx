import Link from 'next/link';
import {
  getReportStageState,
  REPORT_STAGES,
  type ReportStage,
} from '@/lib/report-progress';

export function ReportProgress({
  current,
  links = {},
}: {
  current: ReportStage;
  links?: Partial<Record<ReportStage, string>>;
}) {
  return (
    <nav aria-label="Etapas do relatório" className="report-progress">
      <ol className="report-progress__list">
        {REPORT_STAGES.map((stage, index) => {
          const state = getReportStageState(current, stage.id);
          const href = links[stage.id];
          const statusLabel =
            state === 'done'
              ? 'concluída'
              : state === 'current'
                ? 'etapa atual'
                : 'próxima etapa';
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`report-progress__dot report-progress__dot--${state}`}
              >
                {state === 'done' ? '✓' : index + 1}
              </span>
              <span className="report-progress__visually-hidden">{`${stage.label}, ${statusLabel}`}</span>
              <span
                aria-hidden="true"
                className={`report-progress__label report-progress__label--${state}`}
              >
                {stage.label}
              </span>
            </>
          );

          return (
            <li key={stage.id} className="report-progress__item">
              {href && state === 'done' ? (
                <Link
                  href={href}
                  className={`report-progress__link report-progress__link--${state}`}
                  aria-label={`${stage.label}, concluída. Voltar para ${stage.label}`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={`report-progress__link report-progress__link--${state}`}
                >
                  {content}
                </span>
              )}
              {index < REPORT_STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`report-progress__line report-progress__line--${state}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
