import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { loadRootEnv } from '../src/env';

// Testes de RLS contra o projeto Supabase hosted (002 — CA-003/CA-004 + bordas).
// Gatilho explícito para não bater no banco no `pnpm test` comum:
//   RUN_DB_TESTS=1 pnpm --filter @naabsa/db test
loadRootEnv();

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED =
  process.env.RUN_DB_TESTS === '1' && !!URL && !!ANON && !!SERVICE;

const PASSWORD = 'Rls-Test-Pass-123!';
const SUFFIX = `${Date.now()}`;
const emailFor = (role: string): string =>
  `rls-test-${role}-${SUFFIX}@example.com`;

function makeClient(key: string): SupabaseClient {
  return createClient(URL ?? '', key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let service: SupabaseClient;
let anon: SupabaseClient;
let operatorClient: SupabaseClient;
let adminClient: SupabaseClient;
let noRoleClient: SupabaseClient;

let operatorId = '';
let adminId = '';
let noRoleId = '';
let draftTypeId = '';
let baseSpecId = '';

const createdUserIds: string[] = [];
const createdSpecIds: string[] = [];
const createdReportIds: string[] = [];

async function createUser(role: 'operator' | 'admin' | 'none'): Promise<{
  id: string;
  client: SupabaseClient;
}> {
  const { data, error } = await service.auth.admin.createUser({
    email: emailFor(role),
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const user: User | null = data.user;
  if (!user) throw new Error('createUser não retornou usuário');
  createdUserIds.push(user.id);

  if (role !== 'none') {
    const { error: pErr } = await service
      .from('profiles')
      .insert({ user_id: user.id, role, display_name: `RLS ${role}` });
    if (pErr) throw pErr;
  }

  const client = makeClient(ANON ?? '');
  const { error: sErr } = await client.auth.signInWithPassword({
    email: emailFor(role),
    password: PASSWORD,
  });
  if (sErr) throw sErr;
  return { id: user.id, client };
}

describe.skipIf(!ENABLED)('RLS — matriz de acesso por papel (002)', () => {
  beforeAll(async () => {
    service = makeClient(SERVICE ?? '');
    anon = makeClient(ANON ?? '');

    const op = await createUser('operator');
    operatorId = op.id;
    operatorClient = op.client;
    const ad = await createUser('admin');
    adminId = ad.id;
    adminClient = ad.client;
    const nr = await createUser('none');
    noRoleId = nr.id;
    noRoleClient = nr.client;

    // Fixtures: tipo seedado + spec base (para FKs de reports).
    const { data: types, error: tErr } = await service
      .from('report_types')
      .select('id')
      .eq('slug', 'draft_survey')
      .single();
    if (tErr) throw tErr;
    draftTypeId = types.id as string;

    const { data: spec, error: spErr } = await service
      .from('report_specs')
      .insert({
        report_type_id: draftTypeId,
        version: 1,
        spec: { report_type: 'draft_survey', version: 1 },
        created_by: adminId,
      })
      .select('id')
      .single();
    if (spErr) throw spErr;
    baseSpecId = spec.id as string;
    createdSpecIds.push(baseSpecId);
  }, 90_000);

  afterAll(async () => {
    for (const id of createdReportIds) {
      await service.from('reports').delete().eq('id', id);
    }
    for (const id of createdSpecIds) {
      await service.from('report_specs').delete().eq('id', id);
    }
    for (const id of createdUserIds) {
      await service.from('profiles').delete().eq('user_id', id);
      await service.auth.admin.deleteUser(id);
    }
  }, 90_000);

  it('anônimo não lê report_types', async () => {
    const { data } = await anon.from('report_types').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('anônimo não lê reports', async () => {
    const { data } = await anon.from('reports').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('operator lê os 5 report_types (autenticado)', async () => {
    const { data, error } = await operatorClient
      .from('report_types')
      .select('*');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('operator NÃO insere report_specs (não é admin)', async () => {
    const { error } = await operatorClient.from('report_specs').insert({
      report_type_id: draftTypeId,
      version: 50,
      spec: { x: 1 },
      created_by: operatorId,
    });
    expect(error).not.toBeNull();
  });

  it('admin insere report_specs', async () => {
    const { data, error } = await adminClient
      .from('report_specs')
      .insert({
        report_type_id: draftTypeId,
        version: 2,
        spec: { report_type: 'draft_survey', version: 2 },
        created_by: adminId,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    if (data) createdSpecIds.push(data.id as string);
  });

  it('report_specs é imutável — admin não consegue alterar (RLS sem UPDATE)', async () => {
    // Sem política de UPDATE, a RLS filtra a linha: 0 linhas afetadas, sem erro.
    // O efetivo é o que importa — o spec NÃO pode mudar.
    await adminClient
      .from('report_specs')
      .update({ spec: { hacked: true } })
      .eq('id', baseSpecId);
    const { data } = await service
      .from('report_specs')
      .select('spec')
      .eq('id', baseSpecId)
      .single();
    expect(data?.spec).toEqual({ report_type: 'draft_survey', version: 1 });
  });

  it('report_specs é imutável — nem o service role atualiza (trigger)', async () => {
    const { error } = await service
      .from('report_specs')
      .update({ spec: { hacked: true } })
      .eq('id', baseSpecId);
    expect(error).not.toBeNull();
  });

  it('operator insere e lê reports', async () => {
    const { data, error } = await operatorClient
      .from('reports')
      .insert({
        report_type_id: draftTypeId,
        spec_id: baseSpecId,
        created_by: operatorId,
        vessel_name: 'RLS Test Vessel',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    if (data) {
      createdReportIds.push(data.id as string);
      const { data: read } = await operatorClient
        .from('reports')
        .select('id')
        .eq('id', data.id);
      expect((read ?? []).length).toBe(1);
    }
  });

  it('usuário SEM papel não lê nem insere reports', async () => {
    const { data } = await noRoleClient.from('reports').select('*');
    expect(data ?? []).toHaveLength(0);
    const { error } = await noRoleClient.from('reports').insert({
      report_type_id: draftTypeId,
      spec_id: baseSpecId,
      created_by: noRoleId,
    });
    expect(error).not.toBeNull();
  });

  it('operator só enxerga o próprio profile', async () => {
    const { data } = await operatorClient.from('profiles').select('*');
    const rows = data ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0]?.user_id).toBe(operatorId);
  });

  it('admin enxerga vários profiles', async () => {
    const { data } = await adminClient.from('profiles').select('*');
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });

  // ── Bordas (T-008) ──

  it('borda: delete de report faz cascade nas report_photos', async () => {
    const { data: rep } = await service
      .from('reports')
      .insert({
        report_type_id: draftTypeId,
        spec_id: baseSpecId,
        created_by: adminId,
      })
      .select('id')
      .single();
    const reportId = rep?.id as string;
    const { data: photo } = await service
      .from('report_photos')
      .insert({ report_id: reportId, original_path: 'orig/x.jpg' })
      .select('id')
      .single();
    expect(photo?.id).toBeTruthy();

    await service.from('reports').delete().eq('id', reportId);
    const { data: orphan } = await service
      .from('report_photos')
      .select('id')
      .eq('id', photo?.id as string);
    expect(orphan ?? []).toHaveLength(0);
  });

  it('borda: audit_log aceita actor null via service role (worker)', async () => {
    const { error } = await service
      .from('audit_log')
      .insert({ actor: null, action: 'rls_test', payload: { ok: true } });
    expect(error).toBeNull();
  });
});
