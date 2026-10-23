import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '@naabsa/core';

describe('0029 — cadastro BQS sem ativação antecipada', () => {
  it('registra spec válido, preserva legado e é idempotente sem ativar o modelo', async () => {
    const sql = await readFile(
      new URL('../migrations/0029_register_bqs.sql', import.meta.url),
      'utf8',
    );
    const fixture = JSON.parse(
      await readFile(
        new URL('../../../tests/fixtures/specs/bqs.v1.json', import.meta.url),
        'utf8',
      ),
    );
    const db = new PGlite();
    try {
      await db.exec(`
        create table report_types(id uuid primary key default gen_random_uuid(), slug text unique, name text, variants text[], active_spec_id uuid);
        create table report_specs(id uuid primary key default gen_random_uuid(), report_type_id uuid references report_types(id), version int, spec jsonb, unique(report_type_id,version));
        insert into report_types(slug,name,variants,active_spec_id) values ('bunker_surveyor','Legacy',array['loading','discharge'],'00000000-0000-0000-0000-000000000001');
      `);
      const before = (
        await db.query(
          "select * from report_types where slug='bunker_surveyor'",
        )
      ).rows;
      await db.exec(sql);
      await db.exec(sql);
      expect(
        (
          await db.query(
            "select * from report_types where slug='bunker_surveyor'",
          )
        ).rows,
      ).toEqual(before);
      const types = (
        await db.query<{ active_spec_id: string | null; variants: string[] }>(
          "select * from report_types where slug='bqs'",
        )
      ).rows;
      expect(types).toHaveLength(1);
      expect(types[0]!.active_spec_id).toBeNull();
      expect(types[0]!.variants).toEqual([]);
      const specs = (
        await db.query<{ spec: unknown }>('select spec from report_specs')
      ).rows;
      expect(specs).toHaveLength(1);
      expect(validateSpec(specs[0]!.spec).valid).toBe(true);
      expect(specs[0]!.spec).toEqual(fixture);
    } finally {
      await db.close();
    }
  });
});
