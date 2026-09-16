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
import { useEffect, useState, useTransition } from 'react';
import type { FieldDef, FieldValue, Issue } from '@naabsa/core';
import { setOverride, type SetOverrideResult } from '@/lib/actions/review';
import { formatNumberDraft, parseLocalizedNumber } from '@/lib/localized-number';

interface FieldRowProps {
  reportId: string;
  name: string;
  def: FieldDef;
  value: FieldValue;
  isOverride: boolean;
  /** Issues que afetam este campo. */
  fieldIssues: Issue[];
  /** Callback para sincronizar issues globais após override. */
  onIssuesUpdated: (result: Exclude<SetOverrideResult, { error: string }>) => void;
  onSavingChanged: (saving: boolean) => void;
}

export function FieldRow({
  reportId,
  name,
  def,
  value,
  isOverride,
  fieldIssues,
  onIssuesUpdated,
  onSavingChanged,
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
    onSavingChanged(true);
    startTransition(async () => {
      try {
        const result = await setOverride(reportId, name, newVal);
        if ('error' in result) {
          setSaveError(result.error);
        } else {
          setLocalIsOverride(true);
          onIssuesUpdated(result);
        }
      } catch {
        setSaveError('Falha de conexão ao salvar. Tente novamente.');
      } finally {
        onSavingChanged(false);
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
        {fieldIssues.map((issue, index) => (
          <div
            key={`${issue.origin ?? 'validation'}-${index}`}
            style={{
              marginTop: 4,
              fontSize: 11,
              color: issue.level === 'error' ? '#bf2c30' : '#8a6516',
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
                background: issue.level === 'error' ? '#bf2c30' : '#bb8420',
                color: '#fff',
                borderRadius: 3,
                padding: '0 5px',
                lineHeight: '16px',
              }}
            >
              {issue.level === 'error' ? 'ERRO' : issue.origin === 'ai' ? 'AVISO IA' : 'AVISO'}
            </span>
            {issue.message}
          </div>
        ))}

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
        <LocalizedNumberInput
          value={value}
          decimals={def.decimals}
          onChange={onChange}
          disabled={disabled}
          inputStyle={inputStyle}
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
          onBlur={(e) => {
            // Fallback: browser automation (Playwright fill+blur) may bypass
            // React's onChange for date inputs; fire onChange if value drifted.
            const newVal = e.target.value || null;
            const currentVal = typeof value === 'string' ? value : null;
            if (newVal !== currentVal) onChange(newVal);
          }}
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

interface LocalizedNumberInputProps {
  value: FieldValue;
  decimals?: number;
  onChange: (value: FieldValue) => void;
  disabled: boolean;
  inputStyle: React.CSSProperties;
}

/**
 * Mantém o texto em edição localmente. Assim uma alteração só é persistida
 * ao sair do campo (ou pressionar Enter), sem desmontar o input a cada tecla.
 */
function LocalizedNumberInput({ value, decimals, onChange, disabled, inputStyle }: LocalizedNumberInputProps) {
  const currentValue = typeof value === 'number' ? value : null;
  const [draft, setDraft] = useState(() => formatNumberDraft(currentValue, decimals));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraft(formatNumberDraft(currentValue, decimals));
  }, [currentValue, decimals, isEditing]);

  function resetDraft() {
    setDraft(formatNumberDraft(currentValue, decimals));
  }

  function commit() {
    setIsEditing(false);
    const parsed = parseLocalizedNumber(draft);
    if (draft.trim() !== '' && parsed === null) {
      resetDraft();
      return;
    }
    if (parsed !== currentValue) onChange(parsed);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
      value={draft}
      disabled={disabled}
      aria-label="Número: aceita vírgula ou ponto decimal"
      onFocus={() => setIsEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          resetDraft();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
