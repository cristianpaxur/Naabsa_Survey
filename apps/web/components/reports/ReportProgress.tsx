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
    <nav aria-label="Etapas do relatório" style={styles.nav}>
      <ol style={styles.list}>
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
                style={{
                  ...styles.dot,
                  ...(state === 'current' ? styles.currentDot : {}),
                  ...(state === 'done' ? styles.doneDot : {}),
                }}
              >
                {state === 'done' ? '✓' : index + 1}
              </span>
              <span
                style={styles.visuallyHidden}
              >{`${stage.label}, ${statusLabel}`}</span>
              <span
                aria-hidden="true"
                style={{
                  ...styles.label,
                  ...(state === 'current' ? styles.currentLabel : {}),
                  ...(state === 'done' ? styles.doneLabel : {}),
                }}
              >
                {stage.label}
              </span>
            </>
          );

          return (
            <li key={stage.id} style={styles.item}>
              {href && state === 'done' ? (
                <Link
                  href={href}
                  style={styles.link}
                  aria-label={`${stage.label}, concluída. Voltar para ${stage.label}`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={state === 'current' ? 'step' : undefined}
                  style={styles.link}
                >
                  {content}
                </span>
              )}
              {index < REPORT_STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{
                    ...styles.line,
                    ...(state === 'done' ? styles.doneLine : {}),
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const styles = {
  nav: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  list: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    color: 'inherit',
    textDecoration: 'none',
  },
  dot: {
    width: 28,
    height: 28,
    flex: 'none',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#a39a8d',
    background: '#fff',
    border: '2px solid #dcd8d0',
  },
  currentDot: {
    color: '#fff',
    background: 'var(--navy)',
    borderColor: 'var(--navy)',
  },
  doneDot: {
    color: '#fff',
    background: '#2f6b48',
    borderColor: '#2f6b48',
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 600,
    color: '#a39a8d',
  },
  currentLabel: {
    color: 'var(--navy)',
    fontWeight: 800,
  },
  doneLabel: {
    color: '#2f6b48',
  },
  line: {
    height: 2,
    flex: 1,
    minWidth: 10,
    margin: '0 10px',
    background: '#dcd8d0',
  },
  doneLine: {
    background: '#9bc5a9',
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
} as const;
