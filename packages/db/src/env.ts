/**
 * Carregador simples do `.env` da raiz do monorepo para `process.env`.
 * Sem dependências; não sobrescreve variáveis já definidas no ambiente.
 * Usado pelo runner de migrations e pelos testes de RLS.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

export function loadRootEnv(envPath: string = ROOT_ENV): void {
  let content: string;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return; // .env é opcional — usa o ambiente do processo
  }
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
