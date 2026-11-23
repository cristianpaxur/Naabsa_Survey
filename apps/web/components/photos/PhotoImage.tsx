'use client';

import { useState } from 'react';

/** Nunca deixa o ícone quebrado do navegador ocupar o cartão. */
export function PhotoImage({ src, label, retryable = true }: {
  src: string; label: string; retryable?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = attempt ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;
  if (failedUrl === url) return (
    <div role="status" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#f4f2ee', color: '#7d7468', fontSize: 12 }}>
      <span>Imagem indisponível</span>
      {retryable && <button type="button" onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); setAttempt(value => value + 1); }}
        style={{ border: '1px solid #c9c3b6', borderRadius: 6, background: '#fff', color: '#16294d', padding: '5px 9px', cursor: 'pointer' }}>
        Recarregar imagem
      </button>}
    </div>
  );
  return <img src={url} alt={label} loading="lazy" draggable={false}
    onError={() => setFailedUrl(url)}
    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
}
