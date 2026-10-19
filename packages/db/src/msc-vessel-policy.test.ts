import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { validateSpec, type PhotoSlot, type ReportSpec } from '@naabsa/core';
import { createTestDatabase } from './testDatabase';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
const actor = randomUUID();
const openStages = ['draft', 'extracted', 'in_review', 'editing'];
let typeId: string;
let specId: string;
let sql: string;
let guardBefore: unknown;
let baseline: Awaited<ReturnType<typeof snapshot>>;
let canonical: ReportSpec & { photo_slots: PhotoSlot[] };
let legacy: typeof canonical;

async function snapshot() {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [table, order] of Object.entries({
    report_types: 'id',
    report_specs: 'report_type_id,version',
    reports: 'id',
    report_photos: 'id',
    audit_log: 'id',
  }))
    result[table] = (
      await db.query<Record<string, unknown>>(
        `select * from ${table} order by ${order}`,
      )
    ).rows;
  return result;
}

async function guardDefinition() {
  return (
    await db.query(
      "select pg_get_functiondef('public.guard_photo_edits()'::regprocedure) as definition",
    )
  ).rows;
}

async function expectAtomicFailure(message: string) {
  await db.exec('savepoint migration_attempt');
  await expect(db.exec(sql)).rejects.toThrow(message);
  await db.exec('rollback to savepoint migration_attempt');
  expect(await snapshot()).toEqual(baseline);
  expect(await guardDefinition()).toEqual(guardBefore);
  expect(
    (
      await db.query<{ plan: string | null }>(
        "select to_regclass('pg_temp.msc_vessel_photo_moves') as plan",
      )
    ).rows[0]?.plan,
  ).toBeNull();
}

beforeAll(async () => {
  // Real schema, RLS, immutable specs, review guards and both photo revisions.
  // Start before 0028 so the legacy data exists when its SQL first runs.
  db = await createTestDatabase('0027_msc_disposal_quantities.sql');
  sql = await readFile(
    new URL(
      '../migrations/0028_msc_vessel_photos_and_surveyor.sql',
      import.meta.url,
    ),
    'utf8',
  );
  guardBefore = await guardDefinition();
  canonical = JSON.parse(
    await readFile(
      new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
      'utf8',
    ),
  );
  legacy = structuredClone(canonical);
  legacy.source.common.fields.surveyors = {
    sheet: 'Summary',
    cell: 'B15',
    type: 'string',
    label: 'Surveyors',
    section: 'Identificação',
  };
  legacy.source.common.fields.light_ship!.cell = 'Z99';
  legacy.photo_slots.find((slot) => slot.id === 'vessel')!.max = 2;
  legacy.photo_slots.push({
    id: 'hull',
    label: 'Hull (casco)',
    aspect: '4:3',
    required: false,
  });
  typeId = (
    await db.query<{ id: string }>(
      "select id from report_types where slug='msc'",
    )
  ).rows[0]!.id;
  specId = (
    await db.query<{ id: string }>(
      'insert into report_specs(report_type_id,version,spec) select $1,coalesce(max(version),0)+1,$2 from report_specs where report_type_id=$1 returning id',
      [typeId, JSON.stringify(legacy)],
    )
  ).rows[0]!.id;
  await db.query('update report_types set active_spec_id=$1 where id=$2', [
    specId,
    typeId,
  ]);
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    actor,
    'msc-migration@example.test',
  ]);
  const otherType = (
    await db.query<{ id: string; active_spec_id: string }>(
      "select id,active_spec_id from report_types where slug='rob'",
    )
  ).rows[0]!;
  otherType.active_spec_id = (
    await db.query<{ id: string }>(
      'insert into report_specs(report_type_id,version,spec) select $1,coalesce(max(version),0)+1,$2 from report_specs where report_type_id=$1 returning id',
      [otherType.id, JSON.stringify({ ...legacy, report_type: 'rob' })],
    )
  ).rows[0]!.id;
  for (const [status, deleted, other] of [
    ...openStages.map((stage) => [stage, false, false]),
    ['approved', false, false],
    ['generated', false, false],
    ['purged', false, false],
    ['draft', true, false],
    ['editing', true, false],
    ['in_review', false, true],
  ]) {
    const reportId = (
      await db.query<{ id: string }>(
        `
      insert into reports(report_type_id,spec_id,created_by,status,deleted_at,
        extracted_data,operator_overrides,working_docx_path,working_docx_revision,
        working_docx_saved_at,approved_docx_path,approved_docx_revision,pdf_paths,
        wopi_lock,wopi_lock_expires_at)
      values($1,$2,$3,$4,case when $5 then now() else null end,
        '{"light_ship":24.1589}','{"surveyors":"manual"}','original.docx',7,
        now(),'approved.docx',6,'{final.pdf}','editor-lock',now()+interval '1 hour') returning id`,
        [
          other ? otherType.id : typeId,
          other ? otherType.active_spec_id : specId,
          actor,
          status,
          deleted,
        ],
      )
    ).rows[0]!.id;
    for (const [slot, position, removed] of [
      ['vessel', 0, false],
      ['vessel', 4, false],
      ['hull', 1, false],
      ['hull', 3, false],
      ['cover', 0, false],
      ['hull', 0, true],
    ])
      await db.query(
        `
      insert into report_photos(report_id,original_path,processed_path,slot_id,position,crop,status,ai_suggested,removed_at,confirmed_by)
      values($1,'original.jpg','original.jpeg',$2,$3,'{"x":0.1,"y":0.2,"width":0.7,"height":0.6}',
        $4,$5,case when $6 then now() else null end,$7)`,
        [
          reportId,
          slot,
          position,
          slot === 'hull' && position === 3 ? 'pending' : 'done',
          slot === 'hull' && position === 3,
          removed,
          actor,
        ],
      );
  }
  baseline = await snapshot();
}, 60000);

beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db?.close();
});

describe('0028 com todos os triggers reais do PostgreSQL', () => {
  it('consolida só MSC aberto, preserva documentos/estado e restaura a proteção; é idempotente', async () => {
    const deliveredSql = await readFile(
      new URL('../../../EXECUTAR_MSC_0028_CORRIGIDA.sql', import.meta.url),
      'utf8',
    );
    expect(deliveredSql.slice(deliveredSql.indexOf('-- October 16'))).toBe(sql);
    await db.exec(deliveredSql);
    const active = (
      await db.query<{ id: string; spec: typeof canonical }>(
        'select s.* from report_specs s join report_types t on t.active_spec_id=s.id where t.id=$1',
        [typeId],
      )
    ).rows[0]!;
    expect(validateSpec(active.spec).valid).toBe(true);
    expect(active.spec.photo_slots).toEqual(canonical.photo_slots);
    expect(active.spec.source.common.fields.surveyors).toBeUndefined();
    expect(active.spec.source.common.fields.light_ship!.cell).toBe('Z99');
    expect(
      (
        await db.query<{ spec: typeof legacy }>(
          'select spec from report_specs where id=$1',
          [specId],
        )
      ).rows[0]!.spec,
    ).toEqual(legacy);
    const after = await snapshot();
    for (const [index, report] of baseline.reports!.entries()) {
      const open =
        report.report_type_id === typeId &&
        openStages.includes(String(report.status)) &&
        !report.deleted_at;
      expect(after.reports![index]).toEqual({
        ...report,
        ...(open
          ? {
              spec_id: active.id,
              data_revision: Number(report.data_revision) + 1,
              photo_review_revision: Number(report.photo_review_revision) + 1,
              extraction_issues: [],
            }
          : {}),
        photo_assignment_revision:
          Number(report.photo_assignment_revision) + (open ? 2 : 0),
      });
      for (const photo of baseline.report_photos!.filter(
        (p) => p.report_id === report.id,
      )) {
        const moved = open && photo.slot_id === 'hull' && !photo.removed_at;
        expect(after.report_photos!.find((p) => p.id === photo.id)).toEqual({
          ...photo,
          ...(moved
            ? { slot_id: 'vessel', position: photo.position === 1 ? 5 : 6 }
            : {}),
        });
      }
    }
    const audit = after.audit_log!.filter(
      (a) => a.action === 'msc_hull_photos_consolidated',
    );
    expect(audit).toHaveLength(4);
    expect(
      audit.map(
        (a) => (a.payload as { assignments: unknown[] }).assignments.length,
      ),
    ).toEqual([2, 2, 2, 2]);
    expect(await guardDefinition()).toEqual(guardBefore);
    expect(
      (
        await db.query<{ plan: string | null }>(
          "select to_regclass('pg_temp.msc_vessel_photo_moves') as plan",
        )
      ).rows[0]?.plan,
    ).toBeNull();
    await db.exec(sql);
    expect(await snapshot()).toEqual(after);
    expect(await guardDefinition()).toEqual(guardBefore);
  });

  it('reverte specs, fotos, revisões, auditoria e função se falhar após mover uma foto; permite retentar', async () => {
    await db.exec(`
      create function pg_temp.fail_second_move() returns trigger language plpgsql as $$
      begin if new.slot_id='vessel' and new.position=6 then raise exception 'falha de ensaio após a primeira foto'; end if; return new; end $$;
      create trigger z_fail_second_move after update on report_photos for each row execute function pg_temp.fail_second_move();
    `);
    await expectAtomicFailure('falha de ensaio após a primeira foto');
    await db.exec('drop trigger z_fail_second_move on report_photos');
    await db.exec(sql);
    expect(await guardDefinition()).toEqual(guardBefore);
  });

  it('recusa qualquer alteração incidental no recorte durante a migração', async () => {
    await db.exec(`
      create function pg_temp.change_crop() returns trigger language plpgsql as $$
      begin new.crop := '{"x":0.9}'::jsonb; return new; end $$;
      create trigger a_change_crop before update on report_photos for each row execute function pg_temp.change_crop();
    `);
    await expectAtomicFailure('Alteração fora do plano de consolidação MSC.');
  });

  it('mantém as recusas de etapa, processamento e slot em operações normais após a migração', async () => {
    await db.exec(sql);
    const editing = baseline.reports!.find(
      (r) =>
        r.report_type_id === typeId && r.status === 'editing' && !r.deleted_at,
    )!;
    const editingPhoto = baseline.report_photos!.find(
      (p) => p.report_id === editing.id && p.slot_id === 'hull',
    )!;
    const review = baseline.reports!.find(
      (r) => r.report_type_id === typeId && r.status === 'in_review',
    )!;
    const pending = baseline.report_photos!.find(
      (p) => p.report_id === review.id && p.status === 'pending',
    )!;
    const ready = baseline.report_photos!.find(
      (p) => p.report_id === review.id && p.slot_id === 'vessel',
    )!;
    for (const [id, statement, message] of [
      [editingPhoto.id, "slot_id='vessel'", 'durante a revisão'],
      [pending.id, 'position=99', 'Aguarde o processamento'],
      [ready.id, "slot_id='hull'", 'Slot inválido'],
      [ready.id, "slot_id='cover'", 'Slot cheio'],
    ]) {
      await db.exec('savepoint manual_edit');
      await expect(
        db.query(`update report_photos set ${statement} where id=$1`, [id]),
      ).rejects.toThrow(String(message));
      await db.exec('rollback to savepoint manual_edit');
    }
    await db.query('update report_photos set position=99 where id=$1', [
      ready.id,
    ]);
    expect(
      (
        await db.query<{ position: number }>(
          'select position from report_photos where id=$1',
          [ready.id],
        )
      ).rows[0]?.position,
    ).toBe(99);
    expect(await guardDefinition()).toEqual(guardBefore);
  });
});
