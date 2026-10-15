import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

describe('0026 — fontes Sludge de novos relatórios MSC', () => {
  it('ativa fontes por rótulo preservando customizações, relatórios e a spec anterior; é idempotente', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text, active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid, version int, spec jsonb);
        create table reports(id uuid primary key default gen_random_uuid(), spec_id uuid, status text, extracted_data jsonb, operator_overrides jsonb, working_docx_path text);
        create table audit_log(action text, payload jsonb);
      `);
      const canonical = JSON.parse(
        await readFile(
          new URL('../../../tests/fixtures/specs/msc.v1.json', import.meta.url),
          'utf8',
        ),
      );
      const legacy = structuredClone(canonical);
      for (const field of Object.values(legacy.source.common.fields) as Array<
        Record<string, unknown>
      >) {
        if (field.sheet === 'Sludge') delete field.row_anchor;
      }
      legacy.source.common.fields.consumption_chief.cell = 'Z99';
      legacy.source.common.fields.purifier_temp.row_anchor = {
        range: 'H50:H60',
        expect: 'Personalizado',
      };
      legacy.source.common.fields.purifier_bowl_freq.row_anchor = {
        ...canonical.source.common.fields.purifier_bowl_freq.row_anchor,
      };
      delete legacy.source.common.fields.purifier_bowl_freq.row_anchor.aliases;
      const typeId = (
        await db.query<{ id: string }>(
          "insert into report_types(slug) values('msc') returning id",
        )
      ).rows[0]!.id;
      const specId = (
        await db.query<{ id: string }>(
          'insert into report_specs(report_type_id,version,spec) values($1,8,$2) returning id',
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
          'insert into reports(spec_id,status,extracted_data,operator_overrides,working_docx_path) values($1,$2,$3,$4,$5)',
          [
            specId,
            status,
            '{"sludge_rate_chief":1741.01}',
            '{"purifier_temp":98}',
            'original.docx',
          ],
        );
      }
      const before = (await db.query('select * from reports order by id')).rows;
      const sql = await readFile(
        new URL(
          '../migrations/0026_msc_sludge_row_anchors.sql',
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
      expect(active.id).not.toBe(specId);
      expect(validateSpec(active.spec).valid).toBe(true);
      for (const [name, field] of Object.entries(
        canonical.source.common.fields,
      ) as Array<[string, Record<string, unknown>]>) {
        const actual = active.spec.source.common.fields[name];
        expect(actual).toEqual(
          ['consumption_chief', 'purifier_temp'].includes(name)
            ? legacy.source.common.fields[name]
            : field,
        );
      }
      expect(
        (await db.query('select * from reports order by id')).rows,
      ).toEqual(before);
      expect(
        (
          await db.query<{ spec: typeof legacy }>(
            'select spec from report_specs where id=$1',
            [specId],
          )
        ).rows[0]!.spec,
      ).toEqual(legacy);
      const specs = (
        await db.query('select * from report_specs order by version')
      ).rows;
      await db.exec(sql);
      expect(
        (await db.query('select * from report_specs order by version')).rows,
      ).toEqual(specs);
      expect((await db.query('select * from audit_log')).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
