/**
 * Insere o spec real do msc no Supabase e o define como active_spec_id do tipo
 * msc. Espelha packages/db/src/seed-real-spec.ts (que faz o mesmo para
 * draft_survey).
 *
 * O seed-dev.ts já inseriu um spec placeholder como version=1.
 * Este script insere o spec real como version=2 (ou próxima) e o ativa.
 *
 * Uso: pnpm tsx packages/db/src/seed-msc-spec.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const specPath = resolve(__dirname, '../../../tests/fixtures/specs/msc.v1.json');
  const specRaw = JSON.parse(readFileSync(specPath, 'utf-8'));
  console.log(`[seed-msc] spec lido: msc contrato=${specRaw.contract ?? '?'}`);

  const { data: rt, error: rtErr } = await admin
    .from('report_types')
    .select('id, active_spec_id')
    .eq('slug', 'msc')
    .single();
  if (rtErr || !rt) throw new Error(`report_type msc não encontrado: ${rtErr?.message}`);
  console.log(`[seed-msc] report_type id=${rt.id}, active_spec_id atual=${rt.active_spec_id}`);

  // report_specs é IMUTÁVEL (RF-35): cada re-seed insere uma NOVA versão
  // (máx + 1) e a ativa. version=1 é o sintético do seed-dev.
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
  console.log(`[seed-msc] spec real inserido como v${nextVersion} (id=${specId}).`);

  const { error: updErr } = await admin
    .from('report_types')
    .update({ active_spec_id: specId })
    .eq('id', rt.id);
  if (updErr) throw new Error(`Falha ao atualizar active_spec_id: ${updErr.message}`);
  console.log(`[seed-msc] active_spec_id atualizado → ${specId}`);
  console.log('[seed-msc] concluído. msc agora usa o spec real mais recente.');
}

main().catch((err: unknown) => {
  console.error('[seed-msc] falha:', err);
  process.exit(1);
});
