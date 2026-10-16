import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

it('0028 consolida Hull em Vessel com ordem, recortes e auditoria; preserva fechados e é idempotente', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table report_types(id uuid primary key default gen_random_uuid(), slug text, active_spec_id uuid);
      create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid, version int, spec jsonb, unique(report_type_id,version));
      create table reports(id uuid primary key default gen_random_uuid(), report_type_id uuid, spec_id uuid, status text,
        extracted_data jsonb default '{"light_ship":24.1589}', operator_overrides jsonb default '{"surveyors":"manual"}',
        working_docx_path text default 'original.docx', deleted_at timestamptz);
      create table report_photos(id uuid primary key default gen_random_uuid(),report_id uuid,slot_id text,position int,
        crop jsonb default '{"x":0.1,"y":0.2,"width":0.7,"height":0.6}',processed_path text default 'original.jpeg',
        status text default 'done',ai_suggested boolean default false,removed_at timestamptz);
      create table audit_log(report_id uuid,action text,payload jsonb);
      create function immutable() returns trigger language plpgsql as $$begin raise exception 'immutable spec'; end$$;
      create trigger immutable before update on report_specs for each row execute function immutable();
    `);
    await db.exec(
      await readFile(
        new URL(
          '../migrations/0025_photo_assignment_revision.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const canonical = JSON.parse(
      await readFile(
        new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
        'utf8',
      ),
    );
    const legacy = structuredClone(canonical);
    legacy.source.common.fields.surveyors = {
      sheet: 'Summary',
      cell: 'B15',
      type: 'string',
      label: 'Surveyors',
      section: 'Identificação',
    };
    legacy.source.common.fields.light_ship.cell = 'Z99';
    legacy.photo_slots.find(
      (slot: { id: string }) => slot.id === 'vessel',
    ).max = 2;
    legacy.photo_slots.push({
      id: 'hull',
      label: 'Hull (casco)',
      aspect: '4:3',
      required: false,
    });
    const typeId = (
      await db.query<{ id: string }>(
        "insert into report_types(slug) values('msc') returning id",
      )
    ).rows[0]!.id;
    const specId = (
      await db.query<{ id: string }>(
        'insert into report_specs(report_type_id,version,spec) values($1,1,$2) returning id',
        [typeId, JSON.stringify(legacy)],
      )
    ).rows[0]!.id;
    await db.query('update report_types set active_spec_id=$1', [specId]);
    for (const status of [
      'draft',
      'extracted',
      'in_review',
      'editing',
      'approved',
      'generated',
    ]) {
      const reportId = (
        await db.query<{ id: string }>(
          'insert into reports(report_type_id,spec_id,status) values($1,$2,$3) returning id',
          [typeId, specId, status],
        )
      ).rows[0]!.id;
      for (const [slot, position] of [
        ['vessel', 0],
        ['vessel', 4],
        ['hull', 1],
        ['hull', 3],
        ['cover', 0],
      ])
        await db.query(
          'insert into report_photos(report_id,slot_id,position) values($1,$2,$3)',
          [reportId, slot, position],
        );
      await db.query(
        "insert into report_photos(report_id,slot_id,position,removed_at) values($1,'hull',0,now())",
        [reportId],
      );
    }
    await db.exec("update reports set deleted_at=now() where status='draft'");
    await db.exec(
      "update report_photos set ai_suggested=true,status='pending' where slot_id='hull' and position=3",
    );
    const before = (
      await db.query<Record<string, unknown>>(
        'select * from reports order by id',
      )
    ).rows;
    const photosBefore = (
      await db.query<Record<string, unknown>>(
        'select * from report_photos order by id',
      )
    ).rows;
    const sql = await readFile(
      new URL(
        '../migrations/0028_msc_vessel_photos_and_surveyor.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(sql);
    const active = (
      await db.query<{ id: string; spec: typeof canonical }>(
        'select s.* from report_specs s join report_types t on t.active_spec_id=s.id',
      )
    ).rows[0]!;
    expect(validateSpec(active.spec).valid).toBe(true);
    expect(active.spec.photo_slots).toEqual(canonical.photo_slots);
    expect(active.spec.source.common.fields.surveyors).toBeUndefined();
    expect(active.spec.source.common.fields.light_ship.cell).toBe('Z99');
    expect(
      (
        await db.query<{ spec: typeof legacy }>(
          'select spec from report_specs where id=$1',
          [specId],
        )
      ).rows[0]!.spec,
    ).toEqual(legacy);
    const after = (
      await db.query<Record<string, unknown>>(
        'select * from reports order by id',
      )
    ).rows;
    const photosAfter = (
      await db.query<Record<string, unknown>>(
        'select * from report_photos order by id',
      )
    ).rows;
    for (const [index, report] of before.entries()) {
      const open = ['extracted', 'in_review', 'editing'].includes(
        String(report.status),
      );
      expect(after[index]).toEqual({
        ...report,
        spec_id: open ? active.id : specId,
        photo_assignment_revision:
          Number(report.photo_assignment_revision) + (open ? 2 : 0),
      });
      const oldPhotos = photosBefore.filter((p) => p.report_id === report.id);
      for (const photo of oldPhotos) {
        const moved = open && photo.slot_id === 'hull' && !photo.removed_at;
        expect(photosAfter.find((p) => p.id === photo.id)).toEqual({
          ...photo,
          ...(moved
            ? { slot_id: 'vessel', position: photo.position === 1 ? 5 : 6 }
            : {}),
        });
      }
    }
    const audit = (
      await db.query<{ action: string; payload: { assignments?: unknown[] } }>(
        'select * from audit_log order by action,report_id',
      )
    ).rows;
    expect(
      audit.filter((a) => a.action === 'msc_hull_photos_consolidated'),
    ).toHaveLength(3);
    expect(
      audit
        .filter((a) => a.action === 'msc_hull_photos_consolidated')
        .every((a) => a.payload.assignments?.length === 2),
    ).toBe(true);
    const specs = (
      await db.query('select * from report_specs order by version')
    ).rows;
    await db.exec(sql);
    expect(
      (await db.query('select * from report_specs order by version')).rows,
    ).toEqual(specs);
    expect(
      (await db.query('select * from report_photos order by id')).rows,
    ).toEqual(photosAfter);
    expect((await db.query('select * from reports order by id')).rows).toEqual(
      after,
    );
    expect(
      (await db.query('select * from audit_log order by action,report_id'))
        .rows,
    ).toEqual(audit);
  } finally {
    await db.close();
  }
}, 30000);
