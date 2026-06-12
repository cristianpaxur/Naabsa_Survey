/**
 * Seed de DESENVOLVIMENTO (decisão do usuário, 2026-06-12). Provisiona, de forma
 * idempotente, contra o projeto Supabase hosted:
 *  - um operador e um admin de teste (auth + profiles);
 *  - um report_specs v1 sintético para `draft_survey` (com variantes) e outro para
 *    `rob` (sem variante), ativando ambos em `report_types.active_spec_id`.
 *
 * Faz o fluxo criar→upload→extracted funcionar (com e sem variante) antes das
 * planilhas reais do cliente.
 *   pnpm db:seed-dev
 */
import { createClient } from '@supabase/supabase-js';
import { validateSpec, type ReportSpec } from '@naabsa/core';
import { loadRootEnv } from './env';

loadRootEnv();

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  throw new Error(
    'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (ver .env.example).',
  );
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEV_PASSWORD = 'naabsa123';

const DEV_USERS = [
  { email: 'operador@naabsa.dev', role: 'operator', name: 'Operador Dev' },
  { email: 'admin@naabsa.dev', role: 'admin', name: 'Admin Dev' },
] as const;

/** Spec sintético de draft_survey — alinhado ao buildCompleteWorkbook do 003. */
const draftSpec: ReportSpec = {
  report_type: 'draft_survey',
  version: 1,
  variants: ['loading', 'discharge'],
  source: {
    sheet: 'DADOS',
    fingerprint: { cell: 'A1', expect: 'NAABSA-DRAFT' },
    common: {
      fields: {
        vessel_name: {
          cell: 'B4',
          type: 'string',
          required: true,
          label: 'Nome do navio',
          section: 'Identificação',
        },
        cargo_weight: {
          cell: 'B5',
          type: 'number',
          decimals: 0,
          label: 'Peso de carga (t)',
          section: 'Carga',
        },
        survey_date: {
          cell: 'B6',
          type: 'date',
          format: 'DD/MMM/YYYY',
          required: true,
          label: 'Data do survey',
          section: 'Survey',
        },
        clean: {
          cell: 'B7',
          type: 'boolean',
          label: 'Porões limpos',
          section: 'Survey',
        },
      },
    },
    by_variant: {
      loading: {
        fields: {
          load_port: {
            cell: 'B8',
            type: 'string',
            required: true,
            label: 'Porto de carregamento',
            section: 'Operação',
          },
        },
      },
      discharge: {
        fields: {
          disch_port: {
            cell: 'B8',
            type: 'string',
            required: true,
            label: 'Porto de descarga',
            section: 'Operação',
          },
        },
      },
    },
  },
  validations: [
    {
      rule: 'range',
      field: 'cargo_weight',
      min: 0,
      max: 200000,
      level: 'warning',
      message: 'Peso de carga fora do intervalo usual.',
    },
  ],
  photo_slots: [
    {
      id: 'draft_fwd',
      label: 'Calado de proa',
      aspect: '4:3',
      required: true,
      max: 1,
    },
  ],
};

/** Spec sintético de ROB — tipo SEM variante (cobre o caminho sem-variante). */
const robSpec: ReportSpec = {
  report_type: 'rob',
  version: 1,
  variants: [],
  source: {
    sheet: 'DADOS',
    fingerprint: { cell: 'A1', expect: 'NAABSA-ROB' },
    common: {
      fields: {
        vessel_name: {
          cell: 'B4',
          type: 'string',
          required: true,
          label: 'Nome do navio',
          section: 'Identificação',
        },
        rob_total: {
          cell: 'B5',
          type: 'number',
          decimals: 2,
          label: 'ROB total (t)',
          section: 'Combustível',
        },
        survey_date: {
          cell: 'B6',
          type: 'date',
          format: 'DD/MMM/YYYY',
          required: true,
          label: 'Data do survey',
          section: 'Survey',
        },
      },
    },
  },
  validations: [],
  photo_slots: [],
};

async function findUserId(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function ensureUser(
  email: string,
  role: string,
  name: string,
): Promise<void> {
  let userId = await findUserId(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`[seed] usuário criado: ${email} (${role})`);
  } else {
    console.log(`[seed] usuário já existe: ${email}`);
  }
  const { error: pErr } = await admin
    .from('profiles')
    .upsert(
      { user_id: userId, role, display_name: name },
      { onConflict: 'user_id' },
    );
  if (pErr) throw pErr;
}

async function ensureActiveSpec(slug: string, spec: ReportSpec): Promise<void> {
  const check = validateSpec(spec);
  if (!check.valid) {
    throw new Error(
      `Spec sintético (${slug}) inválido: ${check.errors.join('; ')}`,
    );
  }

  const { data: type, error: tErr } = await admin
    .from('report_types')
    .select('id')
    .eq('slug', slug)
    .single();
  if (tErr) throw tErr;
  const typeId = type.id as string;

  // Insere v1 sem sobrescrever (report_specs é imutável: ON CONFLICT DO NOTHING).
  await admin.from('report_specs').upsert(
    {
      report_type_id: typeId,
      version: 1,
      spec: spec as unknown as Record<string, unknown>,
    },
    { onConflict: 'report_type_id,version', ignoreDuplicates: true },
  );

  const { data: row, error: sErr } = await admin
    .from('report_specs')
    .select('id')
    .eq('report_type_id', typeId)
    .eq('version', 1)
    .single();
  if (sErr) throw sErr;

  const { error: uErr } = await admin
    .from('report_types')
    .update({ active_spec_id: row.id as string })
    .eq('id', typeId);
  if (uErr) throw uErr;
  console.log(`[seed] spec sintético de ${slug} v1 ativo.`);
}

async function main(): Promise<void> {
  for (const u of DEV_USERS) await ensureUser(u.email, u.role, u.name);
  await ensureActiveSpec('draft_survey', draftSpec);
  await ensureActiveSpec('rob', robSpec);
  console.log(
    `[seed] concluído. Login de teste: operador@naabsa.dev / admin@naabsa.dev (senha ${DEV_PASSWORD}).`,
  );
}

main().catch((err: unknown) => {
  console.error('[seed] falha:', err);
  process.exit(1);
});
