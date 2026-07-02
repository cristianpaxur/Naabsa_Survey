'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetToDraft } from '@/lib/actions/reports';

/**
 * "Enviar nova planilha" (014/T-008, RF-005): volta o relatório a `draft` para
 * refazer o upload no MESMO relatório. Confirmação avisa que os ajustes manuais
 * (overrides) serão descartados — eles referem-se à extração anterior.
 */
export function ResetToDraftButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onReset() {
    if (
      !window.confirm(
        'Enviar uma nova planilha? Os dados extraídos e os ajustes manuais desta revisão serão substituídos pela nova extração. As fotos são mantidas.',
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await resetToDraft(reportId);
    setBusy(false);
    if ('error' in res) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={() => void onReset()}
      disabled={busy}
      style={{
        height: 38,
        padding: '0 16px',
        background: '#fff',
        border: '1.5px solid #d9d4cb',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        color: '#4a443c',
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? 'Reiniciando…' : 'Enviar nova planilha'}
    </button>
  );
}
