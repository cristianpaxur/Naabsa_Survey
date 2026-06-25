import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@naabsa/db';
import { serverSupabaseConfig } from './config';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase ligado ao request/response do middleware. Mantém a sessão
 * fresca (refresh do token) e devolve o usuário atual. O middleware.ts usa isto
 * para proteger as rotas e resolver o papel.
 */
export function createMiddlewareClient(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { url, anonKey } = serverSupabaseConfig();

  const supabase = createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  return { supabase, response };
}
