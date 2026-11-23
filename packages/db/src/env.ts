/**
 * Carregador simples do `.env` da raiz do monorepo para `process.env`.
 * Sem dependências; não sobrescreve variáveis já definidas no ambiente.
 * Usado pelo runner de migrations e pelos testes de RLS.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseEnv } from 'node:util';

const ROOT_ENV = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.env',
);

/**
 * Normaliza a connection string: se a senha contiver caracteres especiais não
 * codificados (ex.: `@` na senha → mais de um `@` na URI), percent-codifica a
 * senha para a URI ficar válida para o `pg`. Senhas de painel costumam ter
 * `@`, `$`, etc. cru.
 */
export function normalizeConnectionString(raw: string): string {
  if ((raw.match(/@/g) ?? []).length <= 1) return raw;
  const schemeEnd = raw.indexOf('://');
  if (schemeEnd === -1) return raw;
  const scheme = raw.slice(0, schemeEnd + 3);
  const rest = raw.slice(schemeEnd + 3);
  const lastAt = rest.lastIndexOf('@');
  const userinfo = rest.slice(0, lastAt);
  const hostpart = rest.slice(lastAt + 1);
  const firstColon = userinfo.indexOf(':');
  if (firstColon === -1) return raw;
  const user = userinfo.slice(0, firstColon);
  const password = userinfo.slice(firstColon + 1);
  return `${scheme}${user}:${encodeURIComponent(password)}@${hostpart}`;
}

export function loadRootEnv(envPath?: string): void {
  // Mesmo contrato dos serviços: process.env > .env.local > .env.
  for (const file of envPath ? [envPath] : [`${ROOT_ENV}.local`, ROOT_ENV]) {
    let content: string;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    for (const [key,value] of Object.entries(parseEnv(content))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
