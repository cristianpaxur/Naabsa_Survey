'use client';

import './editor.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEditorUrl } from '@/lib/actions/editor';
import type { ReportStatus } from '@/lib/state-machine';
import { PreviewPanel } from './PreviewPanel';

/**
 * Tela 06 — Editor nativo Collabora (012/T-003). Substitui o TipTap: o canvas é o
 * LibreOffice no browser (iframe WOPI) editando o `working.docx` real. O Collabora
 * autossalva via WOPI; Preview/Aprovar reusam o PreviewPanel (PDF do .docx editado).
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
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="ed-shell">
      <header className="ed-header">
        <div className="ed-header__title">
          <h1>{vesselName ?? 'Relatório'}</h1>
          <span className="ed-header__spec">{specLabel}</span>
        </div>
        <div className="ed-header__actions">
          {state === 'ready' && (
            <span className="ed-savechip ed-savechip--saved">✓ Edição nativa · salva automaticamente</span>
          )}
          <button className="ed-btn" onClick={() => { setAutoApprove(false); setView('preview'); }}>
            Preview
          </button>
          {!readOnly && (
            <button
              className="ed-btn ed-btn--primary"
              onClick={() => { setAutoApprove(true); setView('preview'); }}
            >
              Aprovar e gerar PDF
            </button>
          )}
        </div>
      </header>

      <div className="ed-canvas-scroll">
        {state === 'ready' && url ? (
          <iframe
            className="ed-collabora"
            title="Editor do relatório (Collabora)"
            src={url}
            allow="clipboard-read; clipboard-write"
          />
        ) : state === 'error' ? (
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
    </div>
  );
}
