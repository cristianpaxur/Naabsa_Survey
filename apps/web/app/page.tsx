import type { ReactElement } from 'react';

export default function Home(): ReactElement {
  return (
    <main style={{ padding: '40px 32px', maxWidth: 720 }}>
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          color: 'var(--rocha)',
          margin: 0,
        }}
      >
        @naabsa/web · esqueleto (impl 001)
      </p>
      <h1 style={{ color: 'var(--navy)', fontSize: 30, margin: '8px 0 6px' }}>
        Sistema de Relatórios Automatizados Naabsa
      </h1>
      <p style={{ color: 'var(--rocha)', marginTop: 0 }}>
        Fundação do monorepo. As telas reais chegam nas implementações 005–010
        (ver <code>implementation/</code>).
      </p>
    </main>
  );
}
