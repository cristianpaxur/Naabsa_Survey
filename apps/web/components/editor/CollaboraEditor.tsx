'use client';

import './editor.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { beginDocumentSave, confirmDocumentSave, getEditorUrl, retryBuildWorkingDocx } from '@/lib/actions/editor';
import type { ReportStatus } from '@/lib/state-machine';
import { PreviewPanel } from './PreviewPanel';
import { isCollaboraSaveSessionInvalid, requestCollaboraSave } from './collabora-save';

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
  const [saveReceipt, setSaveReceipt] = useState<string>();
  const savingRef = useRef(false);
  const saveAbort = useRef<AbortController | null>(null);
  useEffect(() => () => saveAbort.current?.abort(), []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [needsReopen, setNeedsReopen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setState('loading');
    setIframeReady(false);
    setError(null);
    setBuildFailed(false);
    let attempts = 0;
    const tick = async (): Promise<void> => {
      const res = await getEditorUrl(reportId).catch(() => ({ error: 'Falha de conexão ao preparar o documento.', canRetry: true }));
      if ('url' in res) {
        setUrl(res.url);
        setState('ready');
        return;
      }
      if ('error' in res) {
        // Build morto no dead-letter (014/T-005): sem polling cego — mostra o
        // motivo e o "Tentar de novo" re-enfileira a montagem.
        setBuildFailed('canRetry' in res && res.canRetry === true);
        setError(res.error);
        setState('error');
        return;
      }
      // pending: o worker ainda monta o working.docx — aguarda e tenta de novo.
      if (++attempts > 60) {
        setBuildFailed(true);
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
    setIframeReady(true);
  }, [url]);

  const saveAndThen = useCallback(async (next: () => void) => {
    if (savingRef.current || needsReopen) return;
    const win = iframeRef.current?.contentWindow;
    if (!url || !win) { setSaveError('O editor ainda não está disponível.'); return; }
    if (initialStatus !== 'editing') { next(); return; }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveReceipt(undefined);
    const controller = new AbortController();
    saveAbort.current = controller;
    try {
      const request = await beginDocumentSave(reportId);
      if ('error' in request) throw new Error(request.error);
      const outcome = await requestCollaboraSave(window, win, new URL(url).origin, controller.signal);
      const saved = await confirmDocumentSave(reportId, request.token, outcome);
      if ('error' in saved) throw new Error(saved.error);
      if (!controller.signal.aborted) { setSaveReceipt(saved.receipt); next(); }
    } catch (err) {
      if (!controller.signal.aborted) {
        setSaveError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.');
        setNeedsReopen(isCollaboraSaveSessionInvalid(win));
      }
    } finally {
      savingRef.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }, [url, reportId, initialStatus, needsReopen]);

  if (view === 'preview') {
    return (
      <PreviewPanel
        reportId={reportId}
        initialStatus={initialStatus}
        autoApprove={autoApprove}
        saveReceipt={saveReceipt}
        onBackToEdit={() => {
          setAutoApprove(false);
          setIframeReady(false);
          setView('edit');
        }}
      />
    );
  }

  const readOnly = initialStatus !== 'editing';
  const busy = saving || needsReopen || !iframeReady || state !== 'ready';

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
          ) : state === 'ready' && !needsReopen && iframeReady ? (
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

      {saveError && (
        <div
          role="alert"
          style={{ background: '#fbeceb', color: '#9b2a2c', padding: '8px 24px', fontSize: 13 }}
        >
          {saveError}
          {needsReopen && (
            <>
              {' '}Antes de reabrir, copie qualquer texto que queira preservar. Alterações sem confirmação podem não ter sido gravadas.
              <button
                className="ed-btn"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  // A ação é explícita: fechar o iframe pode descartar texto
                  // ainda não salvo. O key novo cria outro browsing context.
                  setSaveReceipt(undefined);
                  setNeedsReopen(false);
                  setIframeReady(false);
                  setIframeKey((key) => key + 1);
                  setSaveError('Editor reaberto. Confira o texto antes de salvar e aprovar.');
                }}
              >
                Reabrir editor
              </button>
            </>
          )}
        </div>
      )}

      {state === 'ready' && url ? (
        <div className="ed-collabora-area" inert={saving} aria-busy={saving}>
          <iframe
            key={iframeKey}
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
                onClick={() => {
                  // Falha definitiva do build: re-enfileira antes de voltar ao polling.
                  if (buildFailed) {
                    void retryBuildWorkingDocx(reportId).catch(() => ({ error: 'Falha de conexão. Tente novamente.' })).then((r) => {
                      if ('error' in r) setError(r.error);
                      else load();
                    });
                  } else {
                    load();
                  }
                }}
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
