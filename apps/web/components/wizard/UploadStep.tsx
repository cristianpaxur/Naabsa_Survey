'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Stepper } from './Wizard';

/** Etapa 3 do wizard — upload da planilha + disparo da extração (T-009). */
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
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function extract() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/reports/${reportId}/spreadsheet`, {
      method: 'POST',
      body: fd,
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? 'Falha na extração.');
      setBusy(false);
      return;
    }
    router.push(`/reports/${reportId}/review`);
  }

  return (
    <div style={{ padding: '30px 40px 44px', minHeight: '100%' }}>
      <Stepper step={3} />

      <div style={{ maxWidth: 600, margin: '36px auto 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <Badge bg="var(--navy)" fg="#fff">
            {typeName}
          </Badge>
          {variantLabel && (
            <Badge bg="#eef1f7" fg="#27406e">
              {variantLabel}
            </Badge>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />

        {file ? (
          <div
            style={{
              border: '2px solid #c4e0cf',
              borderRadius: 14,
              background: '#fff',
              padding: '24px 26px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <FileIcon />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#2f6b48', marginTop: 3 }}>
                Pronto · {(file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
            <button onClick={() => inputRef.current?.click()} style={linkBtn}>
              Trocar
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            style={{
              width: '100%',
              border: '2px dashed #c3bdb0',
              borderRadius: 14,
              background: '#fff',
              padding: '40px 28px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Clique para selecionar a planilha
            </div>
            <div
              style={{ fontSize: 12.5, color: 'var(--rocha)', marginTop: 6 }}
            >
              apenas{' '}
              <b style={{ fontFamily: 'var(--font-mono)', color: '#7d7468' }}>
                .xlsx
              </b>{' '}
              · máx. 20 MB
            </div>
          </button>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 16,
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
            marginTop: 28,
          }}
        >
          <button onClick={onBack} disabled={busy} style={secondaryBtn}>
            ← Voltar
          </button>
          <button
            onClick={extract}
            disabled={!file || busy}
            style={{
              height: 44,
              padding: '0 24px',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              background: file ? 'var(--navy)' : '#dcd8d0',
              color: file ? '#fff' : '#8a8276',
              cursor: file && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Extraindo…' : 'Extrair dados'}
          </button>
        </div>
      </div>
    </div>
  );
}

const secondaryBtn = {
  height: 44,
  padding: '0 20px',
  background: '#fff',
  border: '1.5px solid #d9d4cb',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  color: '#4a443c',
  cursor: 'pointer',
} as const;

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: 'var(--navy)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
} as const;

function Badge({
  bg,
  fg,
  children,
}: {
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: 12.5,
        background: bg,
        color: fg,
        padding: '5px 12px',
        borderRadius: 99,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function FileIcon() {
  return (
    <div
      style={{
        width: 44,
        height: 54,
        borderRadius: 7,
        background: '#e4f0e8',
        border: '1px solid #c4e0cf',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 700,
        color: '#2f7d52',
        flex: 'none',
      }}
    >
      XLSX
    </div>
  );
}
