'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { permanentlyDeleteReport, restoreReport } from '@/lib/actions/reports';

export function TrashReportActions({
  reportId,
  vesselName,
}: {
  reportId: string;
  vesselName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'restore' | 'delete' | null>(null);

  async function restore() {
    setBusy('restore');
    const result = await restoreReport(reportId);
    setBusy(null);
    if ('error' in result) return window.alert(result.error);
    router.refresh();
  }

  async function removeForever() {
    const label = vesselName ? `"${vesselName}"` : reportId.slice(0, 8);
    if (
      !window.confirm(
        `Excluir definitivamente o relatório ${label}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy('delete');
    const result = await permanentlyDeleteReport(reportId);
    setBusy(null);
    if ('error' in result) return window.alert(result.error);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button
        type="button"
        onClick={() => void restore()}
        disabled={busy !== null}
        style={buttonStyle('#17325f')}
      >
        {busy === 'restore' ? 'Restaurando…' : 'Restaurar'}
      </button>
      <button
        type="button"
        onClick={() => void removeForever()}
        disabled={busy !== null}
        style={buttonStyle('#bf2c30')}
      >
        {busy === 'delete' ? 'Excluindo…' : 'Excluir definitivamente'}
      </button>
    </div>
  );
}

function buttonStyle(color: string) {
  return {
    border: `1px solid ${color}`,
    background: '#fff',
    color,
    borderRadius: 7,
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  } as const;
}
