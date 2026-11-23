import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

describe('0022 — MSC purifier rows for new reports', () => {
  it('activates a valid copy, preserving all existing reports, custom fields and ECR, then is idempotent', async () => {
    const sql = await readFile(
      new URL(
        '../migrations/0022_msc_purifier_row_anchors.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const original = JSON.parse(
      await readFile(
        new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
        'utf8',
      ),
    );
    for (const field of [
      'purifier_temp',
      'purifier_flow',
      'purifier_bowl_freq',
    ]) {
      delete original.source.common.fields[field].row_anchor;
    }
    original.custom_marker = 'preserve';
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text unique, active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid references report_types(id), version int, spec jsonb, unique(report_type_id,version));
        create table reports(id uuid primary key default gen_random_uuid(), report_type_id uuid references report_types(id), spec_id uuid references report_specs(id), data jsonb, working_docx_path text);
        create table audit_log(report_id uuid references reports(id), action text, payload jsonb);
        create function forbid_update() returns trigger language plpgsql as $$begin raise exception 'immutable spec'; end$$;
        create trigger immutable before update on report_specs for each row execute function forbid_update();
      `);
      const typeId = (
        await db.query<{ id: string }>(
          "insert into report_types(slug) values ('msc') returning id",
        )
      ).rows[0]!.id;
      const oldId = (
        await db.query<{ id: string }>(
          'insert into report_specs(report_type_id,version,spec) values($1,4,$2) returning id',
          [typeId, JSON.stringify(original)],
        )
      ).rows[0]!.id;
      await db.query('update report_types set active_spec_id=$1', [oldId]);
      await db.query(
        'insert into reports(report_type_id,spec_id,data,working_docx_path) values($1,$2,$3,$4)',
        [typeId, oldId, '{"purifier_temp":0}', 'original.docx'],
      );
      const before = (await db.query('select * from reports')).rows;
      await db.exec(sql);
      const active = (
        await db.query<{ id: string; version: number; spec: typeof original }>(
          'select s.* from report_specs s join report_types t on s.id=t.active_spec_id',
        )
      ).rows[0]!;
      expect(active.version).toBe(5);
      expect(active.id).not.toBe(oldId);
      expect(active.spec.source.common.fields.purifier_temp.row_anchor).toEqual(
        { range: 'H29:H40', expect: 'Temperature (°C)' },
      );
      expect(active.spec.source.common.fields.purifier_flow.row_anchor).toEqual(
        {
          range: 'H29:H40',
          expect: 'Flow setting by each purifier (1 x 1,1m3)',
        },
      );
      expect(
        active.spec.source.common.fields.purifier_bowl_freq.row_anchor,
      ).toEqual({
        range: 'H29:H40',
        expect: 'Bowl disch freq. in minutes (60;120)',
      });
      expect(active.spec.photo_slots).toEqual(original.photo_slots);
      const restored = structuredClone(active.spec);
      restored.version = original.version;
      for (const field of [
        'purifier_temp',
        'purifier_flow',
        'purifier_bowl_freq',
      ])
        delete restored.source.common.fields[field].row_anchor;
      expect(restored).toEqual(original);
      const validated = structuredClone(active.spec);
      delete validated.custom_marker;
      expect(validateSpec(validated).valid).toBe(true);
      expect(
        (
          await db.query<{ spec: typeof original }>(
            'select spec from report_specs where id=$1',
            [oldId],
          )
        ).rows[0]!.spec,
      ).toEqual(original);
      expect((await db.query('select * from reports')).rows).toEqual(before);
      expect((await db.query('select * from audit_log')).rows).toHaveLength(1);
      await db.exec(sql);
      expect((await db.query('select * from report_specs')).rows).toHaveLength(
        2,
      );
      expect((await db.query('select * from audit_log')).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
