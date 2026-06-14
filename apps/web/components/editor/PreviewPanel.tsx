'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approve as approveAction,
  getPdfStatus,
  getDownloadUrl,
} from '@/lib/actions/editor';
import type { TipTapDoc } from '@naabsa/core';
import type { ReportStatus } from '@/lib/state-machine';

/**
 * Painel de preview + aprovação + download (008/T-007 + T-009).
 *
 * - Preview pela MESMA rota /print do worker (iframe; RNF-02).
 * - "Aprovar e gerar PDF" → approve() → polling de status → "Baixar PDF".
 */
export function PreviewPanel({
  reportId,
  initialStatus,
  autoApprove = false,
  getDoc,
  onBackToEdit,
}: {
  reportId: string;
  initialStatus: ReportStatus;
  /** Se true, aprova automaticamente ao montar (botão "Aprovar" do editor). */
  autoApprove?: boolean;
  /** Devolve o JSON atual do editor (para enviar na aprovação). */
  getDoc: () => TipTapDoc;
  onBackToEdit: () => void;
}) {
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoApprovedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Polling enquanto o PDF está sendo gerado (status approved).
  useEffect(() => {
    if (status !== 'approved') return;
    let cancelled = false;
    let delay = 2000;

    const tick = async () => {
      const res = await getPdfStatus(reportId);
      if (cancelled) return;
      if ('error' in res) {
        setError(res.error);
        return;
      }
      if (res.status === 'generated') {
        setStatus('generated');
        return;
      }
      delay = Math.min(delay + 500, 4000); // backoff leve (RNF: 2–3 s)
      pollRef.current = setTimeout(() => void tick(), delay);
    };

    pollRef.current = setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [status, reportId, stopPolling]);

  const onApprove = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await approveAction(reportId, getDoc());
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setStatus('approved');
  }, [reportId, getDoc]);

  // Aprovação automática quando o operador clica "Aprovar" no editor (1 clique).
  useEffect(() => {
    if (autoApprove && !autoApprovedRef.current && status === 'editing') {
      autoApprovedRef.current = true;
      void onApprove();
    }
  }, [autoApprove, status, onApprove]);

  async function onDownload() {
    setBusy(true);
    setError(null);
    const res = await getDownloadUrl(reportId);
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    window.open(res.url, '_blank', 'noopener');
  }

  const badge =
    status === 'approved' ? (
      <span className="ed-preview__badge ed-preview__badge--generating">
        <span className="ed-spinner" /> Gerando PDF…
      </span>
    ) : status === 'generated' ? (
      <span className="ed-preview__badge ed-preview__badge--ready">
        ✓ PDF pronto · idêntico ao preview
      </span>
    ) : (
      <span className="ed-preview__badge ed-preview__badge--idle">
        Pré-visualização paginada
      </span>
    );

  return (
    <div className="ed-preview">
      <div className="ed-preview__bar">
        <h2>Preview paginado</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {badge}
          {status === 'editing' && (
            <>
              <button
                className="ed-btn"
                style={{ borderColor: '#fff', color: '#fff', background: 'transparent' }}
                onClick={onBackToEdit}
                disabled={busy}
              >
                Voltar a editar
              </button>
              <button
                className="ed-btn ed-btn--primary"
                style={{ background: '#fff', color: 'var(--navy)', borderColor: '#fff' }}
                onClick={() => void onApprove()}
                disabled={busy}
              >
                {busy ? 'Aprovando…' : 'Aprovar e gerar PDF'}
              </button>
            </>
          )}
          {(status === 'approved' || status === 'generated') && (
            <button
              className="ed-btn ed-btn--primary"
              style={{ background: '#fff', color: 'var(--navy)', borderColor: '#fff' }}
              onClick={() => void onDownload()}
              disabled={busy || status !== 'generated'}
            >
              {status === 'generated' ? 'Baixar PDF' : 'Aguardando PDF…'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: '#fbeceb',
            color: '#9b2a2c',
            padding: '8px 24px',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <iframe
        className="ed-preview__frame"
        title="Preview do relatório"
        src={`/reports/${reportId}/print`}
      />
    </div>
  );
}
