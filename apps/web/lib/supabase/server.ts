import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@naabsa/db';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers,
 * com sessão lida/gravada nos cookies (App Router, Next 15 — `cookies()` async).
 */
/** Tipo do cliente Supabase de servidor (usado por helpers como audit/transition). */
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component (cookies somente-leitura) — o refresh
          // dos cookies acontece no middleware (updateSession). Seguro ignorar.
        }
      },
    },
  });
}
