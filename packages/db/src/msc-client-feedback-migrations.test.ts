import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

describe('MSC — corrections from the October 14 client videos', () => {
  it('adds cover, Hull and missing quantities, retaining custom fields, documents and closed reports', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text, active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid, version int, spec jsonb, unique(report_type_id,version));
        create table reports(id uuid primary key default gen_random_uuid(), report_type_id uuid, spec_id uuid, status text, extracted_data jsonb, operator_overrides jsonb, working_docx_path text, deleted_at timestamptz);
        create table audit_log(report_id uuid, action text, payload jsonb);
        create table report_photos(id uuid primary key default gen_random_uuid(), report_id uuid, slot_id text, position int, crop jsonb, processed_path text, status text, ai_suggested boolean, removed_at timestamptz);
        create function immutable() returns trigger language plpgsql as $$begin raise exception 'immutable spec'; end$$;
        create trigger immutable before update on report_specs for each row execute function immutable();
      `);
      const canonical = JSON.parse(
        await readFile(
          new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
          'utf8',
        ),
      );
      const legacy = structuredClone(canonical);
      for (const key of Object.keys(legacy.source.common.fields).slice(43))
        delete legacy.source.common.fields[key];
      legacy.source.common.fields.grade_1_surveyor = {
        ...canonical.source.common.fields.grade_1_surveyor,
        cell: 'Z99',
      };
      legacy.photo_slots = legacy.photo_slots.filter(
        (slot: { id: string }) => !['cover', 'hull'].includes(slot.id),
      );
      legacy.photo_slots[0].label = 'Vessel (capa)';
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
        'in_review',
        'editing',
        'approved',
        'generated',
      ]) {
        await db.query(
          'insert into reports(report_type_id,spec_id,status,extracted_data,operator_overrides,working_docx_path) values($1,$2,$3,$4,$5,$6)',
          [
            typeId,
            specId,
            status,
            '{"purifier_temp":0}',
            '{"grade_1_vrs":123.4}',
            'original.docx',
          ],
        );
      }
      await db.query(
        "insert into reports(report_type_id,spec_id,status,deleted_at) values($1,$2,'editing',now())",
        [typeId, specId],
      );
      const before = (
        await db.query<Record<string, unknown>>(
          'select * from reports order by id',
        )
      ).rows;
      const sql = (
        await Promise.all(
          [
            '0023_msc_cover_hull_slots.sql',
            '0024_msc_quantity_fields.sql',
            '0025_photo_assignment_revision.sql',
          ].map((file) =>
            readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await db.exec(sql);
      const active = (
        await db.query<{ id: string; spec: typeof canonical }>(
          'select s.* from report_specs s join report_types t on t.active_spec_id=s.id',
        )
      ).rows[0]!;
      expect(validateSpec(active.spec).valid).toBe(true);
      expect(active.spec.photo_slots).toEqual(canonical.photo_slots);
      expect(Object.keys(active.spec.source.common.fields)).toEqual(
        expect.arrayContaining(Object.keys(canonical.source.common.fields)),
      );
      expect(active.spec.source.common.fields.grade_1_surveyor.cell).toBe(
        'Z99',
      );
      expect(active.spec.source.common.fields.grade_1_vrs).toEqual(
        canonical.source.common.fields.grade_1_vrs,
      );
      const after = (
        await db.query<Record<string, unknown>>(
          'select * from reports order by id',
        )
      ).rows;
      for (const [index, report] of after.entries()) {
        const previous = before[index]!;
        expect(report).toEqual({
          ...previous,
          photo_assignment_revision: 0,
          spec_id:
            ['draft', 'in_review', 'editing'].includes(String(report.status)) &&
            !report.deleted_at
              ? active.id
              : specId,
        });
      }
      expect(
        (
          await db.query<{ spec: typeof legacy }>(
            'select spec from report_specs where id=$1',
            [specId],
          )
        ).rows[0]!.spec,
      ).toEqual(legacy);
      const snapshot = (
        await db.query('select * from report_specs order by version')
      ).rows;
      const auditCount = (await db.query('select * from audit_log')).rows
        .length;
      await db.exec(sql);
      expect(
        (await db.query('select * from report_specs order by version')).rows,
      ).toEqual(snapshot);
      expect((await db.query('select * from audit_log')).rows).toHaveLength(
        auditCount,
      );
      const reportId = String(before[0]!.id);
      await db.query(
        "insert into report_photos(report_id,slot_id,position,status,ai_suggested) values($1,'vessel',0,'done',false)",
        [reportId],
      );
      await db.query(
        "update report_photos set slot_id='hull' where report_id=$1",
        [reportId],
      );
      expect(
        (
          await db.query<{ photo_assignment_revision: number }>(
            'select photo_assignment_revision from reports where id=$1',
            [reportId],
          )
        ).rows[0]!.photo_assignment_revision,
      ).toBe(2);
      await db.query(
        "update report_photos set slot_id='hull' where report_id=$1",
        [reportId],
      );
      expect(
        (
          await db.query<{ photo_assignment_revision: number }>(
            'select photo_assignment_revision from reports where id=$1',
            [reportId],
          )
        ).rows[0]!.photo_assignment_revision,
      ).toBe(2);
    } finally {
      await db.close();
    }
  }, 30_000);
});
