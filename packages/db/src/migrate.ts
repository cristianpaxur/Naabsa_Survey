/**
 * Runner de migrations do @naabsa/db.
 *
 * Aplica, em ordem alfabética e cada uma em sua transação, os arquivos
 * `packages/db/migrations/*.sql` contra `DATABASE_URL` (projeto Supabase hosted).
 * As migrations são idempotentes — seguro re-rodar.
 *
 *   pnpm db:migrate            (na raiz)  ·  pnpm --filter @naabsa/db migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

async function main(): Promise<void> {
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
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`[db] aplicando ${file}… `);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('commit');
        process.stdout.write('ok\n');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  console.log(`[db] ${files.length} migration(s) aplicada(s) com sucesso.`);
}

main().catch((err: unknown) => {
  console.error('[db] falha nas migrations:', err);
  process.exit(1);
});
