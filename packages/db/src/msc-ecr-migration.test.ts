import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('0021 — optional ECR for frozen MSC specs', () => {
  it('copies each incomplete spec, moves only open reports, preserves data and is idempotent', async () => {
    const sql = await readFile(
      new URL('../migrations/0021_msc_ecr_slot.sql', import.meta.url),
      'utf8',
    );
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text unique, active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid references report_types(id), version int, spec jsonb, unique(report_type_id,version));
        create table reports(id uuid primary key default gen_random_uuid(), report_type_id uuid references report_types(id), spec_id uuid references report_specs(id), status text, extracted_data jsonb, operator_overrides jsonb, working_docx_path text, deleted_at timestamptz);
        create table audit_log(report_id uuid references reports(id), action text, payload jsonb);
        create function forbid_update() returns trigger language plpgsql as $$begin raise exception 'immutable spec'; end$$;
        create trigger immutable before update on report_specs for each row execute function forbid_update();
      `);
      const type = (
        await db.query<{ id: string }>(
          "insert into report_types(slug) values ('msc') returning id",
        )
      ).rows[0]!.id;
      const createSpec = async (version: number, slots: unknown[]) =>
        (
          await db.query<{ id: string }>(
            'insert into report_specs(report_type_id,version,spec) values($1,$2,$3) returning id',
            [
              type,
              version,
              JSON.stringify({
                version,
                photo_slots: slots,
                sections: [{ id: 'custom', fields: [{ cell: 'Z99' }] }],
                custom: 'retained',
              }),
            ],
          )
        ).rows[0]!.id;
      const old1 = await createSpec(1, [{ id: 'vessel', required: true }]);
      const old2 = await createSpec(2, [
        { id: 'engine_room', label: 'custom label' },
        { id: 'hull' },
      ]);
      const complete = await createSpec(3, [
        { id: 'ecr', label: 'custom ECR', required: false },
      ]);
      await db.query('update report_types set active_spec_id=$1', [old2]);
      for (const status of [
        'draft',
        'extracted',
        'in_review',
        'editing',
        'approved',
        'generated',
        'purged',
        'trashed',
      ]) {
        await db.query(
          'insert into reports(report_type_id,spec_id,status,extracted_data,operator_overrides,working_docx_path) values($1,$2,$3,$4,$5,$6)',
          [
            type,
            status === 'draft' ? old1 : old2,
            status,
            '{"zero":0}',
            '{"manager":"operator"}',
            'original.docx',
          ],
        );
      }
      await db.query(
        "insert into reports(report_type_id,spec_id,status) values($1,$2,'editing')",
        [type, complete],
      );
      const snapshot = (
        await db.query('select * from report_specs order by version')
      ).rows;
      await db.query(
        "insert into reports(report_type_id,spec_id,status,deleted_at) values($1,$2,'editing',now())",
        [type, old1],
      );
      await db.exec(sql);
      const specs = (
        await db.query<{
          id: string;
          version: number;
          spec: {
            photo_slots: { id: string; required?: boolean }[];
            sections: unknown;
            custom: string;
          };
        }>('select * from report_specs order by version')
      ).rows;
      expect(specs).toHaveLength(5);
      expect(specs.slice(0, 3)).toEqual(snapshot);
      expect(specs.slice(3).map((s) => s.spec.photo_slots.at(-1))).toEqual([
        {
          id: 'ecr',
          label: 'ECR (Engine Control Room)',
          aspect: '4:3',
          required: false,
        },
        {
          id: 'ecr',
          label: 'ECR (Engine Control Room)',
          aspect: '4:3',
          required: false,
        },
      ]);
      expect(specs.slice(3).every((s) => s.spec.custom === 'retained')).toBe(
        true,
      );
      expect(specs[3]!.spec.sections).toEqual(specs[0]!.spec.sections);
      expect(specs[4]!.spec.photo_slots.slice(0, -1)).toEqual(
        specs[1]!.spec.photo_slots,
      );
      const reports = (
        await db.query<{
          spec_id: string;
          status: string;
          working_docx_path: string;
          extracted_data: unknown;
          operator_overrides: unknown;
        }>('select * from reports')
      ).rows;
      for (const report of reports.filter((r) => r.working_docx_path)) {
        expect(report.spec_id).toBe(
          ['draft', 'extracted', 'in_review', 'editing'].includes(report.status)
            ? report.status === 'draft'
              ? specs[3]!.id
              : specs[4]!.id
            : old2,
        );
        expect(report.working_docx_path).toBe('original.docx');
        expect(report.extracted_data).toEqual({ zero: 0 });
        expect(report.operator_overrides).toEqual({ manager: 'operator' });
      }
      expect(
        reports
          .filter((r) => !r.working_docx_path)
          .map((r) => r.spec_id)
          .sort(),
      ).toEqual([complete, old1].sort());
      expect(
        (await db.query('select active_spec_id from report_types')).rows,
      ).toEqual([{ active_spec_id: specs[4]!.id }]);
      const audit = (await db.query('select * from audit_log')).rows;
      expect(audit).toHaveLength(5); // four open reports plus active spec
      await db.exec(sql);
      expect(
        (await db.query('select * from report_specs order by version')).rows,
      ).toEqual(specs);
      expect((await db.query('select * from audit_log')).rows).toEqual(audit);
    } finally {
      await db.close();
    }
  }, 30_000);
});
