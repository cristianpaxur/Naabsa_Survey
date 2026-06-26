'use client';

import './editor.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEditorUrl } from '@/lib/actions/editor';
import type { ReportStatus } from '@/lib/state-machine';
import { PreviewPanel } from './PreviewPanel';

/**
 * Tela 06 — Editor nativo Collabora (012/T-003). O canvas é o LibreOffice no
 * browser (iframe WOPI) editando o `working.docx` real.
 *
 * Antes de Preview/Aprovar, manda o Collabora SALVAR (Action_Save via postMessage)
 * e só então converte — senão o PDF sairia do .docx ANTES da edição ser persistida.
 */
type LoadState = 'loading' | 'ready' | 'error';

export function CollaboraEditor({
  reportId,
  vesselName,
  specLabel,
  initialStatus,
  initialView = 'edit',
}: {
  reportId: string;
  vesselName: string | null;
  specLabel: string;
  initialStatus: ReportStatus;
  initialView?: 'edit' | 'preview';
}) {
  const [view, setView] = useState<'edit' | 'preview'>(initialView);
  const [autoApprove, setAutoApprove] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setState('loading');
    setError(null);
    let attempts = 0;
    const tick = async (): Promise<void> => {
      const res = await getEditorUrl(reportId);
      if ('url' in res) {
        setUrl(res.url);
        setState('ready');
        return;
      }
      if ('error' in res) {
        setError(res.error);
        setState('error');
        return;
      }
      // pending: o worker ainda monta o working.docx — aguarda e tenta de novo.
      if (++attempts > 60) {
        setError('Tempo esgotado ao preparar o documento.');
        setState('error');
        return;
      }
      pollRef.current = setTimeout(() => void tick(), 2000);
    };
    void tick();
  }, [reportId]);

  useEffect(() => {
    if (view !== 'edit') return;
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [view, load]);

  // Habilita a comunicação postMessage com o Collabora (necessário p/ confirmar o save).
  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (url && win) win.postMessage(JSON.stringify({ MessageId: 'Host_PostmessageReady' }), new URL(url).origin);
  }, [url]);

  // Manda o Collabora SALVAR (Action_Save → WOPI PutFile) e só então segue.
  const saveAndThen = useCallback(
    (next: () => void) => {
      const win = iframeRef.current?.contentWindow;
      if (!url || !win) {
        next();
        return;
      }
      const origin = new URL(url).origin;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        window.removeEventListener('message', onResp);
        setSaving(false);
        next();
      };
      const onResp = (e: MessageEvent): void => {
        if (e.origin !== origin) return;
        try {
          const m = JSON.parse(e.data as string) as { MessageId?: string };
          if (m?.MessageId === 'Action_Save_Resp') finish();
        } catch {
          /* ignora mensagens não-JSON */
        }
      };
      setSaving(true);
      window.addEventListener('message', onResp);
      win.postMessage(
        JSON.stringify({ MessageId: 'Action_Save', Values: { Notify: true, DontTerminateEdit: true, DontSaveIfUnmodified: false } }),
        origin,
      );
      // Fallback: segue mesmo sem a confirmação (o save já foi disparado).
      setTimeout(finish, 4000);
    },
    [url],
  );

  if (view === 'preview') {
    return (
      <PreviewPanel
        reportId={reportId}
        initialStatus={initialStatus}
        autoApprove={autoApprove}
        onBackToEdit={() => {
          setAutoApprove(false);
          setView('edit');
        }}
      />
    );
  }

  const readOnly = initialStatus !== 'editing';
  const busy = saving || state !== 'ready';

  return (
    <div className="ed-shell">
      <header className="ed-header">
        <div className="ed-header__title">
          <h1>{vesselName ?? 'Relatório'}</h1>
          <span className="ed-header__spec">{specLabel}</span>
        </div>
        <div className="ed-header__actions">
          {saving ? (
            <span className="ed-savechip ed-savechip--saving">
              <span className="ed-spinner" /> Salvando…
            </span>
          ) : state === 'ready' ? (
            <span className="ed-savechip ed-savechip--saved">✓ Edição nativa · salva automaticamente</span>
          ) : null}
          <button
            className="ed-btn"
            disabled={busy}
            onClick={() => saveAndThen(() => { setAutoApprove(false); setView('preview'); })}
          >
            Preview
          </button>
          {!readOnly && (
            <button
              className="ed-btn ed-btn--primary"
              disabled={busy}
              onClick={() => saveAndThen(() => { setAutoApprove(true); setView('preview'); })}
            >
              Aprovar e gerar PDF
            </button>
          )}
        </div>
      </header>

      {state === 'ready' && url ? (
        <div className="ed-collabora-area">
          <iframe
            ref={iframeRef}
            className="ed-collabora"
            title="Editor do relatório (Collabora)"
            src={url}
            onLoad={onIframeLoad}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      ) : (
        <div className="ed-canvas-scroll">
          {state === 'error' ? (
            <div className="ed-preview__placeholder">
              {error ?? 'Não foi possível abrir o editor.'}{' '}
              <button
                onClick={() => load()}
                style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <div className="ed-preview__placeholder">
              <span className="ed-spinner" /> Preparando o documento… (montando o .docx do relatório)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
