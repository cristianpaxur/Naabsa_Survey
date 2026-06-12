import type { ReactElement } from 'react';

/**
 * Placeholder de tela do esqueleto (impl 001). Cada rota do PRD §7 renderiza
 * isto até a sua implementação real (005–010). Estilo inline proposital:
 * o design system entra com a impl 005.
 */
export function Placeholder({
  title,
  route,
  impl,
}: {
  title: string;
  route: string;
  impl: string;
}): ReactElement {
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
        {route}
      </p>
      <h1 style={{ color: 'var(--navy)', fontSize: 28, margin: '8px 0 6px' }}>
        {title}
      </h1>
      <p style={{ color: 'var(--rocha)', margin: 0 }}>
        Tela placeholder — implementação <strong>{impl}</strong>.
      </p>
    </main>
  );
}
