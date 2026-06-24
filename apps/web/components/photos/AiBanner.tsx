'use client';

/**
 * Banner de sugestões de IA na tela de fotos (010/T-009, RF-37).
 * Aparece quando há fotos pré-alocadas pela IA (`ai_suggested`). "Confirmar
 * todas" zera a flag (grava `confirmed_by`). Nada é decidido sem o operador.
 */
export function AiBanner({
  count,
  busy,
  onConfirmAll,
}: {
  count: number;
  busy: boolean;
  onConfirmAll: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        background: 'var(--navy)',
        color: '#fff',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {count} foto{count !== 1 ? 's' : ''} pré-alocada{count !== 1 ? 's' : ''} pela IA
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
          Confirme ou mova — a confirmação zera a flag. Nada é decidido sem você.
        </div>
      </div>
      <button
        onClick={onConfirmAll}
        disabled={busy}
        style={{
          background: '#fff',
          color: 'var(--navy)',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Confirmando…' : 'Confirmar todas'}
      </button>
    </div>
  );
}
