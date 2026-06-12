import type { ReactElement } from 'react';
import type { ReportStatus } from '@/lib/state-machine';

interface StatusStyle {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

// Cores exatas do statusMap do protótipo (design/).
export const STATUS_MAP: Record<ReportStatus, StatusStyle> = {
  draft: { label: 'Rascunho', bg: '#efece7', fg: '#7d7468', dot: '#b3aa9d' },
  extracted: {
    label: 'Extraído',
    bg: '#e9eef7',
    fg: '#27406e',
    dot: '#3a5994',
  },
  in_review: {
    label: 'Em revisão',
    bg: '#f6eed8',
    fg: '#8a6516',
    dot: '#bb8420',
  },
  editing: { label: 'Em edição', bg: '#e6eefb', fg: '#1f4f9c', dot: '#2f6bd0' },
  approved: { label: 'Aprovado', bg: '#e4f0e8', fg: '#2f6b48', dot: '#3a8159' },
  generated: { label: 'Gerado', bg: '#2f7d52', fg: '#ffffff', dot: '#bfe6cf' },
  purged: { label: 'Expurgado', bg: '#f2f0ed', fg: '#a79e92', dot: '#cabfb1' },
};

export function StatusBadge({
  status,
}: {
  status: ReportStatus;
}): ReactElement {
  const s = STATUS_MAP[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 11px 5px 9px',
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.dot,
        }}
      />
      {s.label}
    </span>
  );
}
