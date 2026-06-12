'use client';

import { Stepper } from './Wizard';

/**
 * Etapa 3 do wizard — upload da planilha. Versão mínima (T-008); o dropzone real
 * + disparo da extração entram na T-009.
 */
export function UploadStep({
  reportId,
  typeName,
  variantLabel,
  onBack,
}: {
  reportId: string;
  typeName: string;
  variantLabel: string | null;
  onBack: () => void;
}) {
  return (
    <div style={{ padding: '30px 40px 44px', minHeight: '100%' }}>
      <Stepper step={3} />

      <div style={{ maxWidth: 600, margin: '36px auto 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <span
            style={{
              fontSize: 12.5,
              background: 'var(--navy)',
              color: '#fff',
              padding: '5px 12px',
              borderRadius: 99,
              fontWeight: 600,
            }}
          >
            {typeName}
          </span>
          {variantLabel && (
            <span
              style={{
                fontSize: 12.5,
                background: '#eef1f7',
                color: '#27406e',
                padding: '5px 12px',
                borderRadius: 99,
                fontWeight: 600,
              }}
            >
              {variantLabel}
            </span>
          )}
        </div>

        <div
          style={{
            border: '2px dashed #c3bdb0',
            borderRadius: 14,
            background: '#fff',
            padding: '40px 28px',
            textAlign: 'center',
            color: 'var(--rocha)',
          }}
        >
          Upload da planilha — etapa implementada na T-009.
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              marginTop: 8,
            }}
          >
            relatório {reportId.slice(0, 8)} criado (draft)
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <button
            onClick={onBack}
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
            ← Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
