/**
 * Runner de migrations do @naabsa/db.
 *
 * Aplica, em ordem alfabética e em um lote transacional, os arquivos
 * `packages/db/migrations/*.sql` contra `DATABASE_URL` (projeto Supabase hosted).
 * As migrations são idempotentes — seguro re-rodar.
 *
 *   pnpm db:migrate            (na raiz)  ·  pnpm --filter @naabsa/db migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';
import { loadRootEnv, normalizeConnectionString } from './env';
import { applyMigrations } from './migration-runner';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

async function main(): Promise<void> {
  loadRootEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL ausente — defina no .env (ver .env.example / PRD §13).',
    );
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('[db] nenhuma migration encontrada.');
    return;
  }

  // Supabase exige TLS; local (localhost/127.0.0.1) dispensa.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const client = new Client({
    connectionString: normalizeConnectionString(connectionString),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const migrations = await Promise.all(files.map(async name => ({name, sql: await readFile(path.join(MIGRATIONS_DIR,name),'utf8')})));
    const applied = await applyMigrations(client, migrations);
    console.log(`[db] ${applied.length} migrations novas aplicadas; ${files.length - applied.length} já registradas.`);
  } finally {
    await client.end();
  }

  console.log('[db] schema atualizado com sucesso.');
}

main().catch((err: unknown) => {
  console.error('[db] falha nas migrations:', err);
  process.exit(1);
});
