'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Upload de planilha para relatório JÁ EXISTENTE em `draft` (014/T-008, RF-005).
 * Cobre o rascunho recém-criado que ficou sem planilha (extração falhou/abandono)
 * e o pós-"Enviar nova planilha". Mesmo endpoint do wizard
 * (`POST /api/reports/[id]/spreadsheet` — exige `draft`).
 */
export function ReuploadPanel({ reportId }: { reportId: string }) {
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
    try {
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
      // Mesma rota: o server component recarrega já em `extracted` → revisão.
      router.refresh();
    } catch {
      setError('Falha na extração. Tente novamente.');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '24px 0',
        background: '#fff',
        border: '1px solid var(--borda)',
        borderRadius: 14,
        padding: '26px 28px',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        Envie a planilha para extração
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--rocha)', marginBottom: 18 }}>
        O relatório está em rascunho — os dados serão extraídos da planilha enviada
        (apenas <b style={{ fontFamily: 'var(--font-mono)' }}>.xlsx</b>, máx. 20 MB).
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            height: 42,
            padding: '0 18px',
            background: '#fff',
            border: '1.5px dashed #c3bdb0',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#4a443c',
            cursor: 'pointer',
          }}
        >
          {file ? file.name : 'Selecionar planilha…'}
        </button>
        <button
          onClick={() => void extract()}
          disabled={!file || busy}
          style={{
            height: 42,
            padding: '0 22px',
            border: 'none',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 700,
            background: file ? 'var(--navy)' : '#dcd8d0',
            color: file ? '#fff' : '#8a8276',
            cursor: file && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Extraindo…' : 'Extrair dados'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 14,
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
    </div>
  );
}
