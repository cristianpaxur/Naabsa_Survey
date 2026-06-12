import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';

// Cliente Supabase com SERVICE ROLE — SOMENTE no servidor (rotas/handlers).
// Usado para operações de serviço (ex.: Storage). NUNCA importar no cliente.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function createServiceClient() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
