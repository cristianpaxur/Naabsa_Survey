import { createHash } from 'node:crypto';

export interface Migration { name: string; sql: string }
export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Um lote é atômico: uma falha nunca deixa as políticas históricas reinstaladas pela metade. */
export async function applyMigrations(client: MigrationClient, migrations: Migration[]): Promise<string[]> {
  const applied: string[] = [];
  await client.query('begin');
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('naabsa:migrations'))");
    await client.query('create schema if not exists naabsa_internal');
    await client.query('revoke all on schema naabsa_internal from public');
    await client.query('create table if not exists naabsa_internal.migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())');
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql.replaceAll('\r\n', '\n')).digest('hex');
      const previous = await client.query('select checksum from naabsa_internal.migrations where name=$1', [migration.name]);
      if (previous.rows.length) {
        if (previous.rows[0]?.checksum !== checksum) throw new Error(`Migration já aplicada foi alterada: ${migration.name}. Crie uma nova migration.`);
        continue;
      }
      await client.query(migration.sql);
      await client.query('insert into naabsa_internal.migrations(name,checksum) values ($1,$2)', [migration.name,checksum]);
      applied.push(migration.name);
    }
    await client.query('commit');
    return applied;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
