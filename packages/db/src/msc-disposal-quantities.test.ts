import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

describe('0027 — mapeamento das quantidades de descarte MSC', () => {
  it('ativa campos por rótulo e aceita a data anterior, preservando customizações, dados e relatórios fechados', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text, active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid, version int, spec jsonb);
        create table reports(id uuid primary key default gen_random_uuid(), report_type_id uuid, spec_id uuid, status text,
          extracted_data jsonb, operator_overrides jsonb, working_docx_path text, deleted_at timestamptz);
        create table audit_log(report_id uuid, action text, payload jsonb);
      `);
      const canonical = JSON.parse(
        await readFile(
          new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
          'utf8',
        ),
      );
      const legacy = structuredClone(canonical);
      delete legacy.source.common.fields.sludge_disposed;
      delete legacy.source.common.fields.retained_chief;
      legacy.source.common.fields.last_attendance = {
        sheet: 'Summary',
        cell: 'B16',
        type: 'enum',
        options: ['Yes', 'No'],
        label: 'Last attendance?',
        section: 'Identificação',
      };
      legacy.source.common.fields.sludge_difference_surveyor.unit = 'm³';
      legacy.source.common.fields.sludge_difference_surveyor.label =
        'Diferença de sludge — surveyor';
      legacy.source.common.fields.sludge_difference_surveyor.section = 'Sludge';
      const custom = structuredClone(legacy);
      custom.source.common.fields.sludge_disposed = {
        ...canonical.source.common.fields.sludge_disposed,
        cell: 'Z99',
      };
      custom.source.common.fields.last_attendance.cell = 'Z98';
      const typeId = (
        await db.query<{ id: string }>(
          "insert into report_types(slug) values('msc') returning id",
        )
      ).rows[0]!.id;
      const ids: string[] = [];
      for (const [index, spec] of [custom, legacy].entries()) {
        ids.push(
          (
            await db.query<{ id: string }>(
              'insert into report_specs(report_type_id,version,spec) values($1,$2,$3) returning id',
              [typeId, index + 8, JSON.stringify(spec)],
            )
          ).rows[0]!.id,
        );
      }
      const activeId = ids[1]!;
      await db.query('update report_types set active_spec_id=$1', [activeId]);
      for (const status of [
        'draft',
        'extracted',
        'in_review',
        'editing',
        'approved',
        'generated',
      ]) {
        await db.query(
          'insert into reports(report_type_id,spec_id,status,extracted_data,operator_overrides,working_docx_path) values($1,$2,$3,$4,$5,$6)',
          [
            typeId,
            activeId,
            status,
            '{"retained_after_discharge":67.53}',
            '{"sludge_disposed":0,"retained_chief":""}',
            'original.docx',
          ],
        );
      }
      await db.query(
        "insert into reports(report_type_id,spec_id,status) values($1,$2,'editing')",
        [typeId, ids[0]],
      );
      await db.query(
        "insert into reports(report_type_id,spec_id,status,deleted_at) values($1,$2,'editing',now())",
        [typeId, activeId],
      );
      const before = (
        await db.query<Record<string, unknown>>(
          'select * from reports order by id',
        )
      ).rows;
      const sql = await readFile(
        new URL(
          '../migrations/0027_msc_disposal_quantities.sql',
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
      expect(active.id).not.toBe(activeId);
      expect(validateSpec(active.spec).valid).toBe(true);
      for (const key of [
        'sludge_disposed',
        'retained_chief',
        'last_attendance',
        'sludge_difference_surveyor',
      ])
        expect(active.spec.source.common.fields[key]).toEqual(
          canonical.source.common.fields[key],
        );
      const after = (
        await db.query<Record<string, unknown>>(
          'select * from reports order by id',
        )
      ).rows;
      for (const [index, row] of after.entries()) {
        const previous = before[index]!;
        const open =
          ['draft', 'extracted', 'in_review', 'editing'].includes(
            String(row.status),
          ) && !row.deleted_at;
        expect(row).toEqual({
          ...previous,
          spec_id: open ? row.spec_id : previous.spec_id,
        });
        if (open) expect(row.spec_id).not.toBe(previous.spec_id);
        if (previous.spec_id === ids[0]) {
          const corrected = (
            await db.query<{ spec: typeof custom }>(
              'select spec from report_specs where id=$1',
              [row.spec_id],
            )
          ).rows[0]!.spec;
          expect(corrected.source.common.fields.sludge_disposed).toEqual(
            custom.source.common.fields.sludge_disposed,
          );
          expect(corrected.source.common.fields.last_attendance).toEqual(
            custom.source.common.fields.last_attendance,
          );
          expect(corrected.source.common.fields.retained_chief).toEqual(
            canonical.source.common.fields.retained_chief,
          );
        }
      }
      expect(
        (
          await db.query<{ spec: typeof legacy }>(
            'select spec from report_specs where id=$1',
            [activeId],
          )
        ).rows[0]!.spec,
      ).toEqual(legacy);
      const snapshot = (
        await db.query('select * from report_specs order by version')
      ).rows;
      const audits = (await db.query('select * from audit_log')).rows.length;
      await db.exec(sql);
      expect(
        (await db.query('select * from report_specs order by version')).rows,
      ).toEqual(snapshot);
      expect(
        (await db.query('select * from reports order by id')).rows,
      ).toEqual(after);
      expect((await db.query('select * from audit_log')).rows).toHaveLength(
        audits,
      );
    } finally {
      await db.close();
    }
  }, 30_000);
});
