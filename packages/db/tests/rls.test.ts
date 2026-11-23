import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadRootEnv } from '../src/env';

// Executado apenas pelo config de integração, em Supabase exclusivo de testes.
loadRootEnv();
if (process.env.RUN_DB_TESTS !== '1' || process.env.NAABSA_TEST_DATABASE !== 'isolated') {
  throw new Error('RLS externo exige RUN_DB_TESTS=1 e NAABSA_TEST_DATABASE=isolated.');
}
for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`RLS externo: ${key} ausente.`);
}
const PASSWORD = 'Rls-Test-Pass-123!';
const SUFFIX = crypto.randomUUID();
const createdUserIds: string[] = [];
const createdSpecIds: string[] = [];
const createdReportIds: string[] = [];
const createdAuditIds: number[] = [];
let typeId = '';
let specId = '';
let operatorId = '';
let adminId = '';
let noRoleId = '';
let operatorClient: SupabaseClient;
let adminClient: SupabaseClient;
let noRoleClient: SupabaseClient;
function client(key: string) {
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = client(process.env.SUPABASE_ANON_KEY!);
function checked<T extends { data: unknown; error: { message: string } | null }>(result: T, context: string): NonNullable<T['data']> {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as NonNullable<T['data']>;
}
async function createUser(role: 'operator' | 'admin' | 'none') {
  const email = `rls-${role}-${SUFFIX}@example.com`;
  const data = checked(await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), 'createUser');
  if (!data.user) throw new Error('createUser não retornou usuário');
  const id = data.user.id;
  createdUserIds.push(id);
  if (role !== 'none') {
    checked(await service.from('profiles').insert({ user_id: id, role, status: 'active', email, display_name: `RLS ${role}` }), 'profile');
  }
  // O login cria auth.sessions real, exigida por current_has_role (0009).
  const signedIn = client(process.env.SUPABASE_ANON_KEY!);
  const login = checked(await signedIn.auth.signInWithPassword({ email, password: PASSWORD }), 'signIn');
  expect(login.session?.access_token).toBeTruthy();
  const allowed = checked(await signedIn.rpc('current_has_role'), 'current_has_role');
  expect(allowed).toBe(role !== 'none');
  return { id, client: signedIn };
}
async function createReport() {
  const row = checked(await service.from('reports').insert({
    report_type_id: typeId, spec_id: specId, created_by: adminId, status: 'in_review',
  }).select('id').single(), 'create report');
  if (!row) throw new Error('Relatório ausente');
  createdReportIds.push(row.id);
  return row.id as string;
}

describe('RLS — acesso ativo, sessões reais e imutabilidade', () => {
  beforeAll(async () => {
    ({ id: operatorId, client: operatorClient } = await createUser('operator'));
    ({ id: adminId, client: adminClient } = await createUser('admin'));
    ({ id: noRoleId, client: noRoleClient } = await createUser('none'));
    // Tipo exclusivo evita colisões com versões publicadas e não muda active_spec_id.
    const type = checked(await service.from('report_types').insert({ slug: `rls_${SUFFIX}`, name: 'Fixture RLS' }).select('id').single(), 'create type');
    typeId = type.id;
    const spec = checked(await service.from('report_specs').insert({
      report_type_id: typeId, version: 1, spec: { fixture: SUFFIX, photo_slots: [] }, created_by: adminId,
    }).select('id').single(), 'create spec');
    specId = spec.id;
    createdSpecIds.push(specId);
  }, 90_000);

  afterAll(async () => {
    // Todas as exclusões usam apenas IDs criados por esta execução.
    const errors: string[] = [];
    async function clean(operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) errors.push(error.message);
    }
    for (const id of createdAuditIds) await clean(service.from('audit_log').delete().eq('id', id));
    for (const id of createdReportIds) {
      await clean(service.from('audit_log').delete().eq('report_id', id));
      await clean(service.from('reports').delete().eq('id', id));
    }
    for (const id of createdSpecIds) await clean(service.from('report_specs').delete().eq('id', id));
    if (typeId) await clean(service.from('report_types').delete().eq('id', typeId));
    for (const id of createdUserIds) {
      await clean(service.from('user_access').delete().eq('linked_user_id', id));
      await clean(service.from('profiles').delete().eq('user_id', id));
      await clean(service.auth.admin.deleteUser(id));
    }
    if (errors.length) throw new Error(`Cleanup RLS falhou: ${errors.join('; ')}`);
  }, 90_000);

  it('anônimo não lê tipos nem relatórios', async () => {
    for (const table of ['report_types', 'reports']) {
      expect(checked(await anon.from(table).select('id'), `anon ${table}`)).toHaveLength(0);
    }
  });
  it('operator ativo lê o tipo exclusivo', async () => {
    expect(checked(await operatorClient.from('report_types').select('id').eq('id', typeId), 'operator type')).toHaveLength(1);
  });
  it('operator não publica spec; admin publica versão livre', async () => {
    const denied = await operatorClient.from('report_specs').insert({ report_type_id: typeId, version: 2, spec: {}, created_by: operatorId });
    expect(denied.error?.code).toBe('42501');
    const published = checked(await adminClient.from('report_specs').insert({ report_type_id: typeId, version: 2, spec: { fixture: SUFFIX }, created_by: adminId }).select('id').single(), 'admin spec');
    expect(published?.id).toBeTruthy();
    createdSpecIds.push(published.id);
  });
  it('spec permanece imutável para admin e service role', async () => {
    const update = await adminClient.from('report_specs').update({ spec: { hacked: true } }).eq('id', specId).select('id');
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);
    expect(checked(await service.from('report_specs').select('spec').eq('id', specId).single(), 'read immutable spec')?.spec).toEqual({ fixture: SUFFIX, photo_slots: [] });
    expect((await service.from('report_specs').update({ spec: {} }).eq('id', specId)).error).not.toBeNull();
  });
  it('operator insere e lê relatório', async () => {
    const row = checked(await operatorClient.from('reports').insert({ report_type_id: typeId, spec_id: specId, created_by: operatorId }).select('id').single(), 'operator insert');
    expect(row?.id).toBeTruthy();
    createdReportIds.push(row.id);
    expect(checked(await operatorClient.from('reports').select('id').eq('id', row.id), 'operator read')).toHaveLength(1);
  });
  it('usuário sem papel não lê nem insere relatório', async () => {
    expect(checked(await noRoleClient.from('reports').select('id'), 'no role read')).toHaveLength(0);
    expect((await noRoleClient.from('reports').insert({ report_type_id: typeId, spec_id: specId, created_by: noRoleId })).error?.code).toBe('42501');
  });
  it('operator vê o próprio profile; admin vê os profiles da execução', async () => {
    const rows = checked(await operatorClient.from('profiles').select('user_id'), 'operator profiles');
    expect(rows).toEqual([{ user_id: operatorId }]);
    expect(checked(await adminClient.from('profiles').select('user_id').in('user_id', [operatorId, adminId]), 'admin profiles')).toHaveLength(2);
  });
  it('excluir relatório remove suas fotos em cascade', async () => {
    const id = await createReport();
    const photo = checked(await service.from('report_photos').insert({ report_id: id, original_path: `${id}/photos/original/test.jpg` }).select('id').single(), 'photo');
    checked(await service.from('reports').delete().eq('id', id), 'delete report');
    expect(checked(await service.from('report_photos').select('id').eq('id', photo.id), 'cascade')).toHaveLength(0);
  });
  it('audit_log aceita actor null e registra ID para cleanup', async () => {
    const row = checked(await service.from('audit_log').insert({ actor: null, action: 'rls_test', payload: { fixture: SUFFIX } }).select('id').single(), 'worker audit');
    createdAuditIds.push(row.id);
  });
  it('desativar revoga sessão; reativar exige um novo login', async () => {
    checked(await service.from('profiles').update({ status: 'inactive' }).eq('user_id', operatorId), 'deactivate');
    expect(checked(await operatorClient.rpc('current_has_role'), 'inactive role')).toBe(false);
    expect(checked(await operatorClient.from('report_types').select('id'), 'inactive types')).toHaveLength(0);
    checked(await service.from('profiles').update({ status: 'active' }).eq('user_id', operatorId), 'reactivate');
    expect(checked(await operatorClient.rpc('current_has_role'), 'old session')).toBe(false);
    checked(await operatorClient.auth.signInWithPassword({ email: `rls-operator-${SUFFIX}@example.com`, password: PASSWORD }), 'new login');
    expect(checked(await operatorClient.rpc('current_has_role'), 'new session')).toBe(true);
  });
});
