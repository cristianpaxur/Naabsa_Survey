'use client';

/**
 * FieldRow — linha de campo na tela de revisão (implementação 006).
 *
 * Exibe: label, chip mono da célula, badge "override" (azul), input
 * adequado ao tipo (text/number/date/enum/boolean) com borda colorida
 * pelo nível da issue, e issue inline (ERRO vermelho / AVISO âmbar).
 *
 * A edição chama setOverride via Server Action e recebe issues atualizadas
 * no retorno para reflectir o estado sem recarregar a página.
 */
import { useState, useTransition } from 'react';
import type { FieldDef, FieldValue, Issue } from '@naabsa/core';
import { setOverride } from '@/lib/actions/review';

interface FieldRowProps {
  reportId: string;
  name: string;
  def: FieldDef;
  value: FieldValue;
  isOverride: boolean;
  /** Issues que afetam este campo. */
  fieldIssues: Issue[];
  /** Callback para sincronizar issues globais após override. */
  onIssuesUpdated: (issues: Issue[]) => void;
}

export function FieldRow({
  reportId,
  name,
  def,
  value,
  isOverride,
  fieldIssues,
  onIssuesUpdated,
}: FieldRowProps) {
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState<FieldValue>(value);
  const [localIsOverride, setLocalIsOverride] = useState(isOverride);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Nível da issue mais grave para este campo
  const topIssue = fieldIssues.find((i) => i.level === 'error')
    ?? fieldIssues.find((i) => i.level === 'warning')
    ?? null;

  function borderColor() {
    if (!topIssue) return 'var(--borda)';
    return topIssue.level === 'error' ? '#bf2c30' : '#bb8420';
  }

  function handleChange(newVal: FieldValue) {
    setLocalValue(newVal);
    setSaveError(null);
    startTransition(async () => {
      const result = await setOverride(reportId, name, newVal);
      if ('error' in result) {
        setSaveError(result.error);
      } else {
        setLocalIsOverride(true);
        onIssuesUpdated(result.issues);
      }
    });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 16px',
        padding: '12px 0',
        borderBottom: '1px solid var(--borda)',
        alignItems: 'start',
      }}
    >
      {/* Coluna esquerda: label + chips */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tinta)' }}>
            {def.label}
          </span>
          {/* Chip da célula (IBM Plex Mono) */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              background: '#efece7',
              color: 'var(--rocha)',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {def.cell}
          </span>
          {/* Badge "override" azul */}
          {localIsOverride && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                background: '#e9eef7',
                color: '#27406e',
                borderRadius: 4,
                padding: '1px 6px',
                fontWeight: 700,
                letterSpacing: '.04em',
              }}
            >
              override
            </span>
          )}
        </div>

        {/* Issue inline */}
        {topIssue && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: topIssue.level === 'error' ? '#bf2c30' : '#8a6516',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                background: topIssue.level === 'error' ? '#bf2c30' : '#bb8420',
                color: '#fff',
                borderRadius: 3,
                padding: '0 5px',
                lineHeight: '16px',
              }}
            >
              {topIssue.level === 'error' ? 'ERRO' : 'AVISO'}
            </span>
            {topIssue.message}
          </div>
        )}

        {saveError && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#bf2c30' }}>
            {saveError}
          </div>
        )}
      </div>

      {/* Coluna direita: input */}
      <div>
        <FieldInput
          def={def}
          value={localValue}
          onChange={handleChange}
          disabled={isPending}
          borderColor={borderColor()}
        />
        {isPending && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--rocha)',
              fontFamily: 'var(--font-mono)',
              marginTop: 3,
              display: 'block',
            }}
          >
            Salvando…
          </span>
        )}
      </div>
    </div>
  );
}

// ── Input por tipo ──────────────────────────────────────────────────────────

interface FieldInputProps {
  def: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  disabled: boolean;
  borderColor: string;
}

function FieldInput({
  def,
  value,
  onChange,
  disabled,
  borderColor,
}: FieldInputProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: `1.5px solid ${borderColor}`,
    borderRadius: 7,
    fontSize: 13,
    background: '#fff',
    color: 'var(--tinta)',
    outline: 'none',
    opacity: disabled ? 0.7 : 1,
    fontFamily: 'var(--font-sans)',
    boxSizing: 'border-box',
  };

  switch (def.type) {
    case 'string':
      return (
        <input
          type="text"
          style={inputStyle}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          value={typeof value === 'number' ? value : ''}
          disabled={disabled}
          step={def.decimals !== undefined ? Math.pow(10, -def.decimals) : 'any'}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(isNaN(n) ? null : n);
          }}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'enum':
      return (
        <select
          style={inputStyle}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Selecione —</option>
          {def.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <select
          style={inputStyle}
          value={value === null ? '' : value ? 'true' : 'false'}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : v === 'true');
          }}
        >
          <option value="">— Selecione —</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      );
  }
}
