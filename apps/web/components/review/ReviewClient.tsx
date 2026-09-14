'use client';

/**
 * ReviewClient — componente cliente da tela de revisão (implementação 006).
 *
 * Gerencia o estado local das issues (actualizadas por setOverride) e
 * orquestra FieldRow + PendingPanel.
 */
import { useEffect, useRef, useState } from 'react';
import type { Issue } from '@naabsa/core';
import type { EffectiveSection } from '@/lib/effective-values';
import { FieldRow } from './FieldRow';
import { PendingPanel } from './PendingPanel';
import { getReviewStatus, retryAiReview, type SetOverrideResult } from '@/lib/actions/review';
import { aiReviewLabel, type AiReviewState } from '@/lib/ai-review';

interface ReviewClientProps {
  reportId: string;
  sections: EffectiveSection[];
  initialIssues: Issue[];
  initialAiReview: AiReviewState | null;
  initialRevision: number;
}

export function ReviewClient({
  reportId,
  sections,
  initialIssues,
  initialAiReview,
  initialRevision,
}: ReviewClientProps) {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [aiReview, setAiReview] = useState(initialAiReview);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(0);
  const revision = useRef(initialRevision);
  const savingRef = useRef(0);
  const editEpoch = useRef(0);

  function applyStatus(result: Exclude<SetOverrideResult, { error: string }>) {
    if (result.revision < revision.current) return;
    revision.current = result.revision;
    setIssues(result.issues);
    setAiReview(result.aiReview);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const epoch = editEpoch.current;
      try {
        if (document.visibilityState === 'visible' && !savingRef.current) {
          const result = await getReviewStatus(reportId);
          if (cancelled || epoch !== editEpoch.current || savingRef.current) return;
          if ('error' in result) setRefreshError(result.error);
          else { applyStatus(result); setRefreshError(null); }
        }
      } catch {
        if (!cancelled) setRefreshError('Não foi possível atualizar a IA. Os avisos anteriores foram mantidos.');
      } finally {
        if (!cancelled) timer = setTimeout(() => { void poll(); }, 5000);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reportId]);

  function onSavingChanged(active: boolean) {
    editEpoch.current++;
    savingRef.current = Math.max(0, savingRef.current + (active ? 1 : -1));
    setSaving(savingRef.current);
  }

  async function retry() {
    setRetrying(true);
    try {
      const result = await retryAiReview(reportId);
      if ('error' in result) setRefreshError(result.error);
      else {
        const epoch = editEpoch.current;
        const fresh = await getReviewStatus(reportId);
        if (epoch !== editEpoch.current || savingRef.current) return;
        if ('error' in fresh) setRefreshError(fresh.error);
        else { applyStatus(fresh); setRefreshError(null); }
      }
    } catch { setRefreshError('Falha de conexão ao solicitar a revisão. Tente novamente.'); }
    finally { setRetrying(false); }
  }

  const totalFields = sections.reduce((acc, s) => acc + s.fields.length, 0);

  function issuesForField(name: string): Issue[] {
    return issues.filter((i) => i.field === name);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        alignItems: 'flex-start',
      }}
    >
      {/* Área principal de campos por seção */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div role="status" aria-live="polite" style={{ padding: 14, marginBottom: 20, border: '1px solid var(--borda)', borderRadius: 8, fontSize: 13 }}>
          <strong>Revisão por IA</strong>
          <p>{aiReviewLabel(aiReview)}{aiReview?.status === 'done' && ` ${issues.filter((i) => i.origin === 'ai').length} aviso(s).`}</p>
          {refreshError && <p style={{ color: '#bf2c30' }}>{refreshError}</p>}
          {(!aiReview || !['queued', 'running'].includes(aiReview.status) || Date.now() - Date.parse(aiReview.updatedAt ?? '') > 120_000) && (
            <button type="button" disabled={retrying || saving > 0} onClick={() => { void retry(); }}>
              {retrying ? 'Solicitando…' : 'Analisar novamente'}
            </button>
          )}
        </div>
        {sections.map((section) => (
          <section key={section.section} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--rocha)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                margin: '0 0 4px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {section.section}
            </h2>
            <div
              style={{
                background: '#fff',
                border: '1px solid var(--borda)',
                borderRadius: 10,
                padding: '0 20px',
              }}
            >
              {section.fields.map((ef) => (
                <FieldRow
                  key={ef.name}
                  reportId={reportId}
                  name={ef.name}
                  def={ef.def}
                  value={ef.value}
                  isOverride={ef.isOverride}
                  fieldIssues={issuesForField(ef.name)}
                  onIssuesUpdated={applyStatus}
                  onSavingChanged={onSavingChanged}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Painel lateral de pendências */}
      <PendingPanel
        reportId={reportId}
        issues={issues}
        totalFields={totalFields}
        saving={saving > 0}
      />
    </div>
  );
}
