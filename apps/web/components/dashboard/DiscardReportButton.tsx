'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trashReport } from '@/lib/actions/reports';

/**
 * Move um relatório para a lixeira. A confirmação exibe o navio para evitar
 * que o operador selecione o relatório errado.
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
    const label = vesselName
      ? `"${vesselName}"`
      : `${reportId.slice(0, 8)} (sem navio)`;
    if (
      !window.confirm(
        `Mover o relatório ${label} para a lixeira? Você poderá restaurá-lo depois.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await trashReport(reportId);
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
      title="Mover para a lixeira"
      aria-label="Mover para a lixeira"
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
