/**
 * Cliente Supabase com SERVICE ROLE para o worker. O worker roda fora do
 * contexto de request (sem sessão de usuário), então usa a service role para
 * ler/gravar no Storage e atualizar `report_photos`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';
import { requireEnv } from './env';

let client: SupabaseClient<Database> | null = null;

export function getServiceClient(): SupabaseClient<Database> {
  if (client) return client;
  client = createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}
