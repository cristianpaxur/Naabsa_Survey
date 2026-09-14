'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approve as approveAction,
  getPdfStatus,
  getDownloadUrl,
  generatePreview,
  getPreviewUrl,
  retryGeneratePdf,
} from '@/lib/actions/editor';
import { regenerate } from '@/lib/actions/regenerate';
import type { ReportStatus } from '@/lib/state-machine';

/**
 * Painel de preview + aprovação + download (008/T-007 + T-009).
 *
 * O preview mostra o PDF REAL gerado pelo worker (mesmo .docx→PDF do download),
 * via job `preview_pdf` — assim a pré-visualização é IDÊNTICA ao documento final.
 */
type PreviewState = 'generating' | 'ready' | 'error';

export function PreviewPanel({
  reportId,
  initialStatus,
  autoApprove = false,
  saveReceipt,
  onBackToEdit,
}: {
  reportId: string;
  initialStatus: ReportStatus;
  autoApprove?: boolean;
  saveReceipt?: string;
  onBackToEdit: () => void;
}) {
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('generating');
  const [pdfFailed, setPdfFailed] = useState(false);
  const [pdfRetryNonce, setPdfRetryNonce] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoApprovedRef = useRef(false);

  // ── Pré-visualização: gera o PDF real e faz polling até ficar pronto ──
  const runPreview = useCallback(async () => {
    if (previewPollRef.current) clearTimeout(previewPollRef.current);
    setPreviewState('generating');
    setPreviewUrl(null);
    setError(null);
    const res = await generatePreview(reportId).catch(() => ({ error: 'Falha de conexão ao iniciar a pré-visualização. Tente novamente.' }));
    if ('error' in res) {
      setPreviewState('error');
      setError(res.error);
      return;
    }
    let attempts = 0;
    const poll = async () => {
      const r = await getPreviewUrl(reportId).catch(() => ({ error: 'Falha de conexão ao consultar a pré-visualização.' }));
      if ('url' in r) {
        setPreviewUrl(r.url);
        setPreviewState('ready');
        return;
      }
      if ('error' in r) {
        setPreviewState('error');
        setError(r.error);
        return;
      }
      if (++attempts > 40) {
        setPreviewState('error');
        setError('Tempo esgotado ao gerar a pré-visualização.');
        return;
      }
      previewPollRef.current = setTimeout(() => void poll(), 1500);
    };
    void poll();
  }, [reportId]);

  useEffect(() => {
    // Só geramos preview ao estar EDITANDO um rascunho. Em approved/generated o
    // PDF final já existe (ou está sendo gerado pela aprovação) → mostramos ele.
    if (autoApprove || initialStatus !== 'editing') return;
    void runPreview();
    return () => {
      if (previewPollRef.current) clearTimeout(previewPollRef.current);
    };
  }, [runPreview, autoApprove, initialStatus]);

  // Quando o PDF final fica pronto (generated), exibe-o no preview.
  useEffect(() => {
    if (status !== 'generated') return;
    let cancelled = false;
    void (async () => {
      const res = await getDownloadUrl(reportId).catch(() => ({ error: 'Falha de conexão ao consultar o PDF.' }));
      if (cancelled) return;
      if ('url' in res) {
        setPreviewUrl(res.url);
        setPreviewState('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, reportId]);

  // ── Polling do PDF FINAL após aprovação (status approved → generated) ──
  useEffect(() => {
    if (status !== 'approved') return;
    let cancelled = false;
    let delay = 2000;
    let attempts = 0;
    const tick = async () => {
      const res = await getPdfStatus(reportId).catch(() => ({ error: 'Falha de conexão ao consultar o PDF. Tente novamente.' }));
      if (cancelled) return;
      if ('error' in res) {
        setError(res.error);
        setPdfFailed(true);
        return;
      }
      if (res.status === 'generated') {
        setStatus('generated');
        return;
      }
      // Dead-letter do generate_pdf (014/RF-002): para o polling e oferece a
      // retentativa — sem isso o relatório ficava preso em `approved`.
      if (res.failed) {
        setPdfFailed(true);
        setError(
          res.failReason
            ? `A geração do PDF falhou: ${res.failReason}`
            : 'A geração do PDF falhou.',
        );
        return;
      }
      if (++attempts >= 90) {
        setPdfFailed(true);
        setError('O PDF está demorando além do esperado. Você pode tentar gerar novamente com segurança.');
        return;
      }
      delay = Math.min(delay + 500, 4000);
      pollRef.current = setTimeout(() => void tick(), delay);
    };
    pollRef.current = setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [status, reportId, pdfRetryNonce]);

  // Retentativa (014/T-004): re-enfileira e retoma o polling.
  const onRetryPdf = useCallback(async () => {
    setBusy(true);
    const res = await retryGeneratePdf(reportId).catch(() => ({ error: 'Falha de conexão ao tentar gerar o PDF.' }));
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setPdfFailed(false);
    setError(null);
    setPdfRetryNonce((n) => n + 1);
  }, [reportId]);

  const onApprove = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await approveAction(reportId, saveReceipt).catch(async () => {
      const current = await getPdfStatus(reportId).catch(() => null);
      if (current && 'status' in current && (current.status === 'approved' || current.status === 'generated')) {
        setStatus(current.status);
        return { error: 'A aprovação foi registrada. Confira a geração do PDF e tente novamente se necessário.', approved: current.status === 'approved' };
      }
      return { error: 'Falha de conexão ao aprovar. Reabra o relatório para conferir o estado.', approved: false };
    });
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      if (res.approved) { setStatus('approved'); setPdfFailed(true); }
      return;
    }
    setStatus('approved');
  }, [reportId, saveReceipt]);

  useEffect(() => {
    if (autoApprove && !autoApprovedRef.current && status === 'editing') {
      autoApprovedRef.current = true;
      void onApprove();
    }
  }, [autoApprove, status, onApprove]);

  async function onDownload() {
    setBusy(true);
    setError(null);
    const res = await getDownloadUrl(reportId).catch(() => ({ error: 'Falha de conexão ao consultar o PDF.' }));
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    window.open(res.url, '_blank', 'noopener');
  }

  // Regenerar (010/T-004): reabre em edição; recarrega para o editor voltar ao modo edit.
  async function onRegenerate() {
    setBusy(true);
    setError(null);
    const res = await regenerate(reportId);
    if ('error' in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    window.location.reload();
  }

  const badge =
    status === 'approved' && pdfFailed ? (
      <span className="ed-preview__badge ed-preview__badge--generating">⚠ Falha na geração do PDF</span>
    ) : status === 'approved' ? (
      <span className="ed-preview__badge ed-preview__badge--generating">
        <span className="ed-spinner" /> Gerando PDF final…
      </span>
    ) : status === 'generated' ? (
      <span className="ed-preview__badge ed-preview__badge--ready">✓ PDF pronto</span>
    ) : previewState === 'ready' ? (
      <span className="ed-preview__badge ed-preview__badge--ready">
        ✓ Pré-visualização fiel (PDF real)
      </span>
    ) : (
      <span className="ed-preview__badge ed-preview__badge--generating">
        <span className="ed-spinner" /> Gerando pré-visualização…
      </span>
    );

  return (
    <div className="ed-preview">
      <div className="ed-preview__bar">
        <h2>Preview</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {badge}
          <button
            className="ed-btn"
            style={{ borderColor: '#fff', color: '#fff', background: 'transparent' }}
            onClick={() => void runPreview()}
            disabled={previewState === 'generating' || status !== 'editing'}
          >
            Atualizar preview
          </button>
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
          {status === 'generated' && (
            <button
              className="ed-btn"
              style={{ borderColor: '#fff', color: '#fff', background: 'transparent' }}
              onClick={() => void onRegenerate()}
              disabled={busy}
              title="Reabrir para edição e gerar uma nova versão do PDF"
            >
              Regenerar
            </button>
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
          style={{ background: '#fbeceb', color: '#9b2a2c', padding: '8px 24px', fontSize: 13 }}
        >
          {error}{' '}
          {pdfFailed ? (
            <button
              onClick={() => void onRetryPdf()}
              disabled={busy}
              style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: '#9b2a2c', cursor: 'pointer' }}
            >
              Tentar gerar novamente
            </button>
          ) : status === 'editing' ? (
            <button
              onClick={onBackToEdit}
              style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: '#9b2a2c', cursor: 'pointer' }}
            >
              Voltar ao editor e salvar
            </button>
          ) : null}
        </div>
      )}

      {previewState === 'ready' && previewUrl ? (
        <iframe className="ed-preview__frame" title="Preview do relatório" src={previewUrl} />
      ) : previewState === 'error' ? (
        <div className="ed-preview__placeholder">Não foi possível gerar a pré-visualização.</div>
      ) : (
        <div className="ed-preview__placeholder">
          <span className="ed-spinner" /> Gerando o PDF real… isso leva alguns segundos.
        </div>
      )}
    </div>
  );
}
