'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createReport } from '@/lib/actions/reports';
import { variantLabel, typeDescription } from '@/lib/labels';
import { UploadStep } from './UploadStep';

export interface WizardType {
  id: string;
  slug: string;
  name: string;
  variants: string[];
  hasActiveSpec: boolean;
}

export function Wizard({ types }: { types: WizardType[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'upload'>('select');
  const [reportId, setReportId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = types.find((t) => t.id === typeId) ?? null;
  const hasVariants = (selected?.variants.length ?? 0) > 0;
  const canContinue =
    !!selected && selected.hasActiveSpec && (!hasVariants || !!variant);

  async function onContinue() {
    if (!selected) return;
    setCreating(true);
    setError(null);
    const result = await createReport({
      reportTypeId: selected.id,
      variant: hasVariants ? variant : null,
    });
    setCreating(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setReportId(result.id);
    setStep('upload');
  }

  if (step === 'upload' && reportId && selected) {
    return (
      <UploadStep
        reportId={reportId}
        typeName={selected.name}
        variantLabel={hasVariants && variant ? variantLabel(variant) : null}
        onBack={() => setStep('select')}
      />
    );
  }

  return (
    <div style={{ padding: '30px 40px 44px', minHeight: '100%' }}>
      <Stepper step={1} />

      <div style={{ maxWidth: 840, margin: '32px auto 0' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>
          Escolha o tipo de relatório
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--rocha)', marginTop: 5 }}>
          O motor usará o spec ativo deste tipo. A versão fica congelada no
          relatório.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            marginTop: 22,
          }}
        >
          {types.map((t) => {
            const sel = t.id === typeId;
            const disabled = !t.hasActiveSpec;
            return (
              <button
                key={t.id}
                disabled={disabled}
                onClick={() => {
                  setTypeId(t.id);
                  setVariant(null);
                  setError(null);
                }}
                style={{
                  position: 'relative',
                  textAlign: 'left',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 18,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.55 : 1,
                  border: sel ? '2px solid var(--navy)' : '1.5px solid #e4e0d8',
                  boxShadow: sel ? '0 0 0 4px rgba(22,41,77,.08)' : 'none',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--rocha)',
                  }}
                >
                  {t.slug}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 7 }}>
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--rocha)',
                    marginTop: 5,
                  }}
                >
                  {typeDescription(t.slug)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 9px',
                      borderRadius: 99,
                      fontWeight: 600,
                      background: t.variants.length ? '#eef1f7' : '#f4f2ee',
                      color: t.variants.length ? '#27406e' : 'var(--rocha)',
                    }}
                  >
                    {disabled
                      ? 'sem spec ativo'
                      : t.variants.length
                        ? `${t.variants.length} variantes`
                        : 'sem variante'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selected && hasVariants && (
          <div
            style={{
              marginTop: 24,
              background: '#fff',
              border: '1.5px solid #e4e0d8',
              borderRadius: 12,
              padding: '20px 22px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                Variante do {selected.name}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  color: 'var(--vermelho)',
                  background: '#fbeceb',
                  border: '1px solid #f0c4c2',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 600,
                }}
              >
                obrigatório
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              {selected.variants.map((v) => {
                const vsel = variant === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      cursor: 'pointer',
                      background: '#fff',
                      border: vsel
                        ? '2px solid var(--navy)'
                        : '1.5px solid #e4e0d8',
                      boxShadow: vsel ? '0 0 0 4px rgba(22,41,77,.08)' : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        flex: 'none',
                        border: vsel
                          ? '5px solid var(--navy)'
                          : '2px solid #cfcabf',
                      }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {variantLabel(v)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 18,
              background: '#fbeceb',
              border: '1px solid #f0c4c2',
              borderRadius: 9,
              padding: '11px 13px',
              fontSize: 13,
              color: '#9b2a2c',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 26,
          }}
        >
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              height: 44,
              padding: '0 20px',
              background: '#fff',
              border: '1.5px solid #d9d4cb',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: '#4a443c',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onContinue}
            disabled={!canContinue || creating}
            style={{
              height: 44,
              padding: '0 24px',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              background: canContinue ? 'var(--navy)' : '#dcd8d0',
              color: canContinue ? '#fff' : '#8a8276',
              cursor: canContinue && !creating ? 'pointer' : 'not-allowed',
            }}
          >
            {creating ? 'Criando…' : 'Continuar para planilha →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div
      style={{
        maxWidth: 840,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <StepDot n={1} label="Tipo" active={step >= 1} done={step > 1} />
      <Line active={step > 1} />
      <StepDot n={2} label="Variante" active={step >= 2} done={step > 2} />
      <Line active={step > 2} />
      <StepDot n={3} label="Planilha" active={step >= 3} done={false} />
    </div>
  );
}

function StepDot({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          background: active ? 'var(--navy)' : '#fff',
          color: active ? '#fff' : '#b5ab9d',
          border: active ? 'none' : '2px solid #dcd8d0',
        }}
      >
        {done ? '✓' : n}
      </div>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: active ? 700 : 600,
          color: active ? 'var(--navy)' : '#a39a8d',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Line({ active }: { active: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        height: 2,
        margin: '0 14px',
        background: active ? 'var(--navy)' : '#dcd8d0',
      }}
    />
  );
}
