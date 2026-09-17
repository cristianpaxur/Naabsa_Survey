import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
const db = new PGlite();
const userId = '00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000002';
const currentReportId = '00000000-0000-4000-8000-000000000004';
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
  for (const file of files.filter((f) => f >= '0009' && f < '0015'))
    await db.exec(load(file));
  const activeBeforePercentageFix = await db.query<{ active_spec_id: string }>(
    'select active_spec_id from report_types where id=$1',
    [typeId],
  );
  await db.query(
    'insert into reports(id,report_type_id,spec_id,created_by) values ($1,$2,$3,$4)',
    [
      currentReportId,
      typeId,
      activeBeforePercentageFix.rows[0]!.active_spec_id,
      userId,
    ],
  );
  for (const file of files.filter((f) => f >= '0015' && f < '0017'))
    await db.exec(load(file));
  await db.query(
    'update reports set extraction_issues=$1, ai_review=$2 where id=$3',
    [
      JSON.stringify([
        {
          field: 'fin_fig_diff_mt',
          cell: 'C39',
          level: 'warning',
          origin: 'ai',
          message: 'Diferença em MT não confere.',
        },
        {
          field: 'fin_fig_diff_pct',
          cell: 'C40',
          level: 'warning',
          origin: 'validation',
          message: 'Diferença final acima de 0,5%.',
        },
      ]),
      JSON.stringify({ status: 'done', data: { fin_fig_diff_mt: -152.596 } }),
      currentReportId,
    ],
  );
  for (const file of files.filter((f) => f >= '0017'))
    await db.exec(load(file));
  await db.exec(
    'grant usage on schema public,auth to authenticated; grant select on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;',
  );
}, 60000);

afterAll(async () => {
  await db.close();
});

describe('migrations no PostgreSQL isolado (sem Supabase externo)', () => {
  it('inicializa mapas de formatos numéricos como objetos vazios em relatórios existentes', async () => {
    const result = await db.query<{
      extracted_number_formats: Record<string, number>;
      operator_number_formats: Record<string, number>;
    }>(
      'select extracted_number_formats,operator_number_formats from reports where id=$1',
      [reportId],
    );

    expect(result.rows[0]).toEqual({
      extracted_number_formats: {},
      operator_number_formats: {},
    });
  });

  it('rejeita arrays nos mapas de formatos numéricos', async () => {
    await expect(
      db.query(
        "update reports set extracted_number_formats='[]'::jsonb where id=$1",
        [reportId],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update reports set operator_number_formats='[]'::jsonb where id=$1",
        [reportId],
      ),
    ).rejects.toThrow();
  });

  it('publica a spec corrigida e move todos os relatórios em andamento', async () => {
    const result = await db.query<{
      spec: {
        source: {
          common: {
            fields: {
              port: { section: string };
              net_tonnage: { decimals: number };
              gross_tonnage: { decimals: number };
              summer_dwt: { decimals: number };
              int_fig_diff_mt: { ai_review: boolean };
              int_fig_diff_pct: { ai_review: boolean };
              fin_fig_diff_mt: { ai_review: boolean };
              fin_fig_diff_pct: { ai_review: boolean };
            };
          };
        };
        validations: { field: string; max: number; message: string }[];
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
      result.rows[0]!.spec.source.common.fields.int_fig_diff_mt.ai_review,
    ).toBe(false);
    expect(
      result.rows[0]!.spec.source.common.fields.int_fig_diff_pct.ai_review,
    ).toBe(false);
    expect(
      result.rows[0]!.spec.source.common.fields.fin_fig_diff_mt.ai_review,
    ).toBe(false);
    expect(
      result.rows[0]!.spec.source.common.fields.fin_fig_diff_pct.ai_review,
    ).toBe(false);
    expect(
      result.rows[0]!.spec.source.common.fields.net_tonnage.decimals,
    ).toBe(3);
    expect(
      result.rows[0]!.spec.source.common.fields.gross_tonnage.decimals,
    ).toBe(3);
    expect(
      result.rows[0]!.spec.source.common.fields.summer_dwt.decimals,
    ).toBe(3);
    expect(
      result.rows[0]!.spec.validations.find(
        (r) => r.field === 'fin_fig_diff_pct',
      ),
    ).toBeUndefined();
    const old = await db.query<{ spec_id: string }>(
      'select spec_id from reports where id=$1',
      [reportId],
    );
    expect(old.rows[0]!.spec_id).toBe(result.rows[0]!.active_spec_id);
    const inProgress = await db.query<{
      spec_id: string;
      extraction_issues: unknown[];
      ai_review: { status: string } | null;
    }>(
      'select spec_id,extraction_issues,ai_review from reports where id=$1',
      [currentReportId],
    );
    expect(inProgress.rows[0]!.spec_id).toBe(result.rows[0]!.active_spec_id);
    expect(inProgress.rows[0]!.extraction_issues).toEqual([]);
    expect(inProgress.rows[0]!.ai_review).toBeNull();
  });
  it('repetir as correções não duplica specs nem auditoria', async () => {
    const before = await db.query('select count(*) from report_specs');
    const auditBefore = await db.query('select count(*) from audit_log');
    await db.exec(load('0015_fix_draft_survey_percentage.sql'));
    await db.exec(load('0017_fix_draft_survey_derived_review.sql'));
    await db.exec(load('0018_ignore_draft_survey_differences.sql'));
    await db.exec(load('0019_report_number_formats.sql'));
    expect((await db.query('select count(*) from report_specs')).rows).toEqual(
      before.rows,
    );
    expect((await db.query('select count(*) from audit_log')).rows).toEqual(
      auditBefore.rows,
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
    expect((await db.query('select id from reports')).rows).toHaveLength(2);
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
