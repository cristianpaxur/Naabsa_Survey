/**
 * Insere o spec real do draft_survey (contrato v2, multi-aba) no Supabase
 * e o define como active_spec_id do tipo draft_survey.
 *
 * O seed-dev.ts já inseriu um spec sintético como version=1.
 * Este script insere o spec real como version=2 e o ativa.
 *
 * Uso: pnpm tsx packages/db/src/seed-real-spec.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRootEnv } from './env';

loadRootEnv();

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.');
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1. Ler o spec real do arquivo
  const specPath = resolve(process.cwd(), '../../tests/fixtures/specs/draft_survey.v1.json');
  const specRaw = JSON.parse(readFileSync(specPath, 'utf-8'));
  console.log(`[seed-real] spec lido: draft_survey contrato=${specRaw.contract ?? '?'}`);

  // 2. Buscar o report_type_id de draft_survey
  const { data: rt, error: rtErr } = await admin
    .from('report_types')
    .select('id, active_spec_id')
    .eq('slug', 'draft_survey')
    .single();
  if (rtErr || !rt) throw new Error(`report_type draft_survey não encontrado: ${rtErr?.message}`);
  console.log(`[seed-real] report_type id=${rt.id}, active_spec_id atual=${rt.active_spec_id}`);

  // 3. report_specs é IMUTÁVEL (RF-35): cada re-seed insere uma NOVA versão
  //    (máx + 1) e a ativa. version=1 é o sintético do seed-dev.
  const { data: versions } = await admin
    .from('report_specs')
    .select('version')
    .eq('report_type_id', rt.id)
    .order('version', { ascending: false })
    .limit(1);
  const maxVersion = (versions?.[0]?.version as number | undefined) ?? 0;
  const nextVersion = maxVersion + 1;

  const { data: inserted, error: insErr } = await admin
    .from('report_specs')
    .insert({ report_type_id: rt.id, version: nextVersion, spec: specRaw })
    .select('id')
    .single();
  if (insErr || !inserted) throw new Error(`Falha ao inserir spec: ${insErr?.message}`);
  const specId = inserted.id as string;
  console.log(`[seed-real] spec real inserido como v${nextVersion} (id=${specId}).`);

  // 4. Definir como active_spec_id
  const { error: updErr } = await admin
    .from('report_types')
    .update({ active_spec_id: specId })
    .eq('id', rt.id);
  if (updErr) throw new Error(`Falha ao atualizar active_spec_id: ${updErr.message}`);
  console.log(`[seed-real] active_spec_id atualizado → ${specId}`);
  console.log('[seed-real] concluído. draft_survey agora usa o spec real mais recente.');
}

main().catch((err: unknown) => {
  console.error('[seed-real] falha:', err);
  process.exit(1);
});
