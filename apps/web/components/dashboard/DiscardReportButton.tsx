'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteReport } from '@/lib/actions/reports';

/**
 * Descartar relatório em `draft`/`extracted` (014/T-007, RF-004). Confirmação
 * exibe o navio para evitar descarte do relatório errado (spec 014 §7).
 */
export function DiscardReportButton({
  reportId,
  vesselName,
}: {
  reportId: string;
  vesselName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDiscard() {
    const label = vesselName ? `"${vesselName}"` : `${reportId.slice(0, 8)} (sem navio)`;
    if (!window.confirm(`Descartar o relatório ${label}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteReport(reportId);
    setBusy(false);
    if ('error' in res) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={() => void onDiscard()}
      disabled={busy}
      title="Descartar relatório"
      aria-label="Descartar relatório"
      style={{
        border: 'none',
        background: 'transparent',
        color: '#9a9082',
        fontSize: 15,
        cursor: busy ? 'wait' : 'pointer',
        padding: 0,
      }}
    >
      🗑
    </button>
  );
}
