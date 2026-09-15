import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
const db = new PGlite();
const userId = '00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';
let historicalSpec = '';
let typeId = '';
const load = (file: string) =>
  readFileSync(`${directory}/${file}`, 'utf8').replace(
    'create extension if not exists pgcrypto;',
    '-- gen_random_uuid nativo no PostgreSQL WASM',
  );

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  const files = readdirSync(directory)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files.filter((f) => f < '0009')) await db.exec(load(file));
  await db.query('insert into auth.users(id,email) values ($1,$2)', [
    userId,
    'unit@example.test',
  ]);
  await db.query(
    "insert into public.profiles(user_id,role,display_name,status) values ($1,'admin','Teste','active')",
    [userId],
  );
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [
    sessionId,
    userId,
  ]);
  const original = await db.query<{ id: string; active_spec_id: string }>(
    "select id,active_spec_id from report_types where slug='draft_survey'",
  );
  typeId = original.rows[0]!.id;
  historicalSpec = original.rows[0]!.active_spec_id;
  await db.query(
    'insert into reports(id,report_type_id,spec_id,created_by) values ($1,$2,$3,$4)',
    [reportId, typeId, historicalSpec, userId],
  );
  for (const file of files.filter((f) => f >= '0009'))
    await db.exec(load(file));
  await db.exec(
    'grant usage on schema public,auth to authenticated; grant select on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;',
  );
}, 60000);

afterAll(async () => {
  await db.close();
});

describe('migrations no PostgreSQL isolado (sem Supabase externo)', () => {
  it('publica nova spec corrigida e preserva a associação dos relatórios antigos', async () => {
    const result = await db.query<{
      spec: {
        source: { common: { fields: { port: { section: string } } } };
        validations: { field: string; max: number }[];
      };
      active_spec_id: string;
    }>(
      'select s.spec,t.active_spec_id from report_types t join report_specs s on s.id=t.active_spec_id where t.id=$1',
      [typeId],
    );
    expect(result.rows[0]!.active_spec_id).not.toBe(historicalSpec);
    expect(result.rows[0]!.spec.source.common.fields.port.section).toBe(
      'Serviço',
    );
    expect(
      result.rows[0]!.spec.validations.find(
        (r) => r.field === 'fin_fig_diff_pct',
      )?.max,
    ).toBe(0.005);
    const old = await db.query<{ spec_id: string }>(
      'select spec_id from reports where id=$1',
      [reportId],
    );
    expect(old.rows[0]!.spec_id).toBe(historicalSpec);
  });
  it('repetir a correção não duplica specs nem auditoria', async () => {
    const before = await db.query('select count(*) from report_specs');
    await db.exec(load('0010_repair_specs.sql'));
    expect((await db.query('select count(*) from report_specs')).rows).toEqual(
      before.rows,
    );
  });
  it('desativar a allowlist revoga a sessão e o JWT anterior perde acesso pela RLS', async () => {
    await db.query(
      "insert into user_access(email,display_name,role,status,linked_user_id) values ('unit@example.test','Teste','admin','active',$1)",
      [userId],
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: userId, session_id: sessionId }),
    ]);
    await db.exec('set role authenticated');
    expect((await db.query('select id from reports')).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.exec(
      "update user_access set status='inactive' where email='unit@example.test'",
    );
    expect(
      (await db.query('select * from auth.sessions where user_id=$1', [userId]))
        .rows,
    ).toHaveLength(0);
    await db.exec('set role authenticated');
    expect((await db.query('select id from reports')).rows).toHaveLength(0);
    expect((await db.query('select id from report_specs')).rows).toHaveLength(
      0,
    );
    expect((await db.query('select id from report_types')).rows).toHaveLength(
      0,
    );
    await db.exec('reset role');
    await db.exec(
      "update user_access set status='active' where email='unit@example.test'",
    );
    await db.exec('set role authenticated');
    expect((await db.query('select id from reports')).rows).toHaveLength(0);
    await db.exec('reset role');
  });
  it('excluir acesso também desativa o perfil na mesma transação', async () => {
    await db.exec("delete from user_access where email='unit@example.test'");
    const profile = await db.query<{ status: string }>(
      'select status from profiles where user_id=$1',
      [userId],
    );
    expect(profile.rows[0]!.status).toBe('inactive');
  });
  it('move e restaura relatório pela lixeira sem perder seu estado', async () => {
    await db.query(
      'update reports set deleted_at=now(), deleted_by=$1 where id=$2',
      [userId, reportId],
    );
    const trashed = await db.query<{
      deleted_at: string | null;
      deleted_by: string | null;
      status: string;
    }>('select deleted_at,deleted_by,status from reports where id=$1', [
      reportId,
    ]);
    expect(trashed.rows[0]!.deleted_at).not.toBeNull();
    expect(trashed.rows[0]!.deleted_by).toBe(userId);
    expect(trashed.rows[0]!.status).toBe('draft');

    await db.query(
      'update reports set deleted_at=null, deleted_by=null where id=$1',
      [reportId],
    );
    const restored = await db.query<{
      deleted_at: string | null;
      deleted_by: string | null;
    }>('select deleted_at,deleted_by from reports where id=$1', [reportId]);
    expect(restored.rows[0]).toEqual({ deleted_at: null, deleted_by: null });
  });
});
