'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@naabsa/db';
import { browserSupabaseConfig } from './config';

// Cliente Supabase para Client Components (browser). A config (URL + anon key,
// públicas por design) é lida em RUNTIME — injetada pelo RootLayout no window —
// para não depender das NEXT_PUBLIC_* serem inlinadas no build (ver config.ts).
export function createClient() {
  const { url, anonKey } = browserSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
