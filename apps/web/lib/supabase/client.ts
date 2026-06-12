'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@naabsa/db';

// Cliente Supabase para Client Components (browser). As variáveis NEXT_PUBLIC_*
// são embutidas pelo Next no bundle (a anon key é pública por design).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
