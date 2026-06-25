import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@naabsa/db';
import { serverSupabaseConfig } from './config';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers,
 * com sessão lida/gravada nos cookies (App Router, Next 15 — `cookies()` async).
 */
/** Tipo do cliente Supabase de servidor (usado por helpers como audit/transition). */
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = serverSupabaseConfig();
  return createServerClient<Database>(url, anonKey, {
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
