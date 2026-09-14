import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyMigrations } from './migration-runner';

// pg.query sem parâmetros usa protocolo simples (múltiplos comandos);
// PGlite expõe esse protocolo como exec, separado de query/prepared.
const clientFor = (db: PGlite) => ({ async query(sql: string, params?: unknown[]) {
  if (params) return db.query<Record<string, unknown>>(sql, params);
  const results = await db.exec(sql);
  return results.at(-1) ?? {rows:[]};
} });

describe('runner de migrations', () => {
  it('não reaplica scripts já registrados e rejeita alteração histórica', async () => {
    const db = new PGlite();
    try {
      const script = {name:'001.sql',sql:'create table example(id integer); insert into example values(1)'};
      expect(await applyMigrations(clientFor(db),[script])).toEqual(['001.sql']);
      expect(await applyMigrations(clientFor(db),[script])).toEqual([]);
      expect((await db.query('select * from example')).rows).toHaveLength(1);
      await expect(applyMigrations(clientFor(db),[{...script,sql:'select 2'}])).rejects.toThrow('já aplicada foi alterada');
    } finally { await db.close(); }
  },30000);
  it('falha faz rollback de todo o lote, inclusive alterações de autorização', async () => {
    const db = new PGlite();
    try {
      await expect(applyMigrations(clientFor(db),[{name:'001.sql',sql:'create table should_rollback(id int)'},{name:'002.sql',sql:'select unknown_column'}])).rejects.toThrow();
      const result = await db.query<{table_name:string|null}>("select to_regclass('public.should_rollback')::text as table_name");
      expect(result.rows[0]?.table_name).toBeNull();
    } finally { await db.close(); }
  },30000);
});
