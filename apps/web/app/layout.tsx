import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import { serverSupabaseConfig, PUBLIC_ENV_GLOBAL } from '@/lib/supabase/config';
import './globals.css';

// Render em runtime (não estático) para que a config pública do Supabase seja lida
// do process.env no momento do request — necessário em deploy por container, onde
// as envs vêm da plataforma e não estão presentes no `next build`.
export const dynamic = 'force-dynamic';

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Naabsa — Relatórios',
  description: 'Sistema de Relatórios Automatizados Naabsa',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Config pública (URL + anon key) lida em runtime e injetada no window para o
  // cliente do browser (ver lib/supabase/config.ts). JSON.stringify de valores
  // controlados (env) — sem entrada do usuário.
  const publicEnv = serverSupabaseConfig();
  return (
    <html
      lang="pt-BR"
      className={`${publicSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.${PUBLIC_ENV_GLOBAL}=${JSON.stringify(publicEnv)}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
