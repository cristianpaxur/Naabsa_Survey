'use client';

/**
 * PendingPanel — painel lateral da revisão de dados (implementação 006).
 *
 * Exibe contadores de erros/avisos/campos OK e o botão "Confirmar dados →".
 * - Botão desabilitado com erros > 0 (CA-004/CA-006).
 * - Banner âmbar quando há avisos mas sem erros (CA-006).
 * - Chama confirmData (Server Action) e navega para /photos.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Issue } from '@naabsa/core';
import { confirmData } from '@/lib/actions/review';

interface PendingPanelProps {
  reportId: string;
  issues: Issue[];
  totalFields: number;
}

export function PendingPanel({
  reportId,
  issues,
  totalFields,
}: PendingPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const okCount = totalFields - new Set(issues.map((i) => i.field)).size;

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  function handleConfirm() {
    setServerError(null);
    startTransition(async () => {
      const result = await confirmData(reportId);
      if ('error' in result) {
        setServerError(result.error);
      } else {
        router.push(`/reports/${reportId}/photos`);
      }
    });
  }

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Título do painel */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--tinta)',
          paddingBottom: 8,
          borderBottom: '1px solid var(--borda)',
        }}
      >
        Pendências
      </div>

      {/* Card de erros */}
      <PendingCard
        count={errors.length}
        label={errors.length === 1 ? 'erro bloqueante' : 'erros bloqueantes'}
        bg="#fef2f2"
        fg="#bf2c30"
        border="#fecaca"
      />

      {/* Card de avisos */}
      <PendingCard
        count={warnings.length}
        label={warnings.length === 1 ? 'aviso' : 'avisos'}
        bg="#fffbeb"
        fg="#8a6516"
        border="#fde68a"
      />

      {/* Card OK */}
      <PendingCard
        count={Math.max(0, okCount)}
        label={okCount === 1 ? 'campo ok' : 'campos ok'}
        bg="#f0fdf4"
        fg="#2f6b48"
        border="#bbf7d0"
      />

      {/* Banner de aviso (apenas warnings, sem erros) */}
      {!hasErrors && hasWarnings && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: '#8a6516',
            lineHeight: 1.5,
          }}
        >
          Há avisos, mas você pode seguir assim mesmo.
        </div>
      )}

      {/* Erro do servidor */}
      {serverError && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: '#bf2c30',
            lineHeight: 1.5,
          }}
        >
          {serverError}
        </div>
      )}

      {/* Botão Confirmar */}
      <button
        onClick={handleConfirm}
        disabled={hasErrors || isPending}
        style={{
          marginTop: 8,
          padding: '11px 16px',
          borderRadius: 9,
          border: 'none',
          background: hasErrors ? '#d1c9be' : 'var(--navy)',
          color: hasErrors ? '#9e9285' : '#fff',
          fontWeight: 700,
          fontSize: 14,
          cursor: hasErrors || isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.75 : 1,
          transition: 'background 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {isPending ? 'Confirmando…' : 'Confirmar dados →'}
      </button>

      {hasErrors && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--rocha)',
            textAlign: 'center',
          }}
        >
          Corrija os erros para continuar.
        </p>
      )}
    </aside>
  );
}

// ── Card de pendência ───────────────────────────────────────────────────────

function PendingCard({
  count,
  label,
  bg,
  fg,
  border,
}: {
  count: number;
  label: string;
  bg: string;
  fg: string;
  border: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 9,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          fontWeight: 700,
          color: fg,
          minWidth: 28,
          lineHeight: 1,
        }}
      >
        {count}
      </span>
      <span style={{ fontSize: 12, color: fg, fontWeight: 500 }}>{label}</span>
    </div>
  );
}
