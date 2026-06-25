/**
 * Config pública do Supabase (URL + anon key — ambos expostos ao browser por design).
 *
 * Lida em RUNTIME para não depender das `NEXT_PUBLIC_*` serem inlinadas no build:
 * em deploy por container (EasyPanel), as envs vêm da plataforma e podem não estar
 * presentes no momento do `next build`. No servidor lemos `process.env.SUPABASE_URL`
 * (que NÃO é inlinada como `NEXT_PUBLIC_*`); no browser usamos a config injetada pelo
 * RootLayout em runtime (window). Há fallback para `NEXT_PUBLIC_*` (dev local).
 */

/** Nome do global injetado no browser pelo RootLayout. */
export const PUBLIC_ENV_GLOBAL = '__NAABSA_PUBLIC_ENV__';

export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

/** Server-side: lê do process.env em runtime (não inlinado). */
export function serverSupabaseConfig(): PublicSupabaseConfig {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey:
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}

/** Browser: usa a config injetada pelo layout; cai para NEXT_PUBLIC_* (dev). */
export function browserSupabaseConfig(): PublicSupabaseConfig {
  if (typeof window !== 'undefined') {
    const injected = (
      window as unknown as Record<string, PublicSupabaseConfig | undefined>
    )[PUBLIC_ENV_GLOBAL];
    if (injected?.url && injected.anonKey) return injected;
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}
