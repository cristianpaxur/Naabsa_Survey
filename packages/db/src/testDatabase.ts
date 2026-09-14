/** PostgreSQL WASM volátil para regressões SQL; nunca carrega .env ou abre conexão. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  try {
    for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(`${directory}/${file}`, 'utf8').replace('create extension if not exists pgcrypto;', '-- gen_random_uuid nativo no PostgreSQL WASM');
      await db.exec(sql);
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
