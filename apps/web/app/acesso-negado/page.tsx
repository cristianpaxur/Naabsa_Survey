import type { ReactElement } from 'react';
import Link from 'next/link';

export default function AcessoNegadoPage(): ReactElement {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{
            width: 46,
            height: 4,
            background: 'var(--vermelho)',
            borderRadius: 3,
            margin: '0 auto 20px',
          }}
        />
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
          Acesso negado
        </h1>
        <p style={{ color: 'var(--rocha)', lineHeight: 1.6, marginTop: 8 }}>
          Sua conta não tem um papel atribuído. Peça a um administrador para
          liberar o seu acesso (operador ou admin).
        </p>
        <Link
          href="/login"
          style={{
            display: 'inline-block',
            marginTop: 20,
            color: 'var(--navy)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Voltar ao login
        </Link>
      </div>
    </main>
  );
}
