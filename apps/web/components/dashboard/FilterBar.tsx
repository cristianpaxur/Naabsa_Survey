'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { STATUS_MAP } from '@/components/ui/StatusBadge';
import type { ReportStatus } from '@/lib/state-machine';

export interface TypeOption {
  slug: string;
  name: string;
}

export function FilterBar({ types }: { types: TypeOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function onSearch(e: ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value);
    setParam('q', e.target.value.trim());
  }

  function clearAll() {
    setQ('');
    router.replace(pathname);
  }

  const statuses = Object.keys(STATUS_MAP) as ReportStatus[];

  return (
    <div
      style={{
        padding: '6px 32px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <input
        value={q}
        onChange={onSearch}
        placeholder="Buscar por navio…"
        style={{
          height: 40,
          padding: '0 13px',
          background: '#fff',
          border: '1px solid #d9d4cb',
          borderRadius: 9,
          width: 260,
          fontSize: 13.5,
          color: '#1d1d1d',
          outline: 'none',
        }}
      />

      <Select
        value={params.get('type') ?? ''}
        onChange={(v) => setParam('type', v)}
        placeholder="Tipo: Todos"
        options={types.map((t) => ({ value: t.slug, label: t.name }))}
      />

      <Select
        value={params.get('status') ?? ''}
        onChange={(v) => setParam('status', v)}
        placeholder="Status: Todos"
        options={statuses.map((s) => ({
          value: s,
          label: STATUS_MAP[s].label,
        }))}
      />

      <Select
        value={params.get('period') ?? ''}
        onChange={(v) => setParam('period', v)}
        placeholder="Período: Todos"
        options={[
          { value: '30', label: 'Últimos 30 dias' },
          { value: '90', label: 'Últimos 90 dias' },
          { value: '365', label: 'Último ano' },
        ]}
      />

      <div style={{ flex: 1 }} />
      <button
        onClick={clearAll}
        style={{
          height: 40,
          padding: '0 13px',
          background: 'transparent',
          border: 'none',
          fontSize: 12.5,
          color: 'var(--rocha)',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Limpar
      </button>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 40,
        padding: '0 13px',
        background: '#fff',
        border: '1px solid #d9d4cb',
        borderRadius: 9,
        fontSize: 13.5,
        color: '#3f3a33',
        fontWeight: 500,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
