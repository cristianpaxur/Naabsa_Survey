/**
 * Validação de ambiente do worker (PRD §13).
 *
 * Fundação (impl 001): valida presença e AVISA para variáveis ausentes, sem
 * impedir o boot do esqueleto. A implementação 004 (pg-boss/Playwright) e a 010
 * endurecem isto: variáveis requeridas passam a LANÇAR em produção.
 */

/** Variáveis lidas pelo worker (subconjunto do PRD §13). */
const WORKER_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'APP_BASE_URL',
  'PRINT_SERVICE_TOKEN',
] as const;

type WorkerEnvVar = (typeof WORKER_ENV_VARS)[number];

/** Lê uma variável obrigatória; lança se ausente (uso sob demanda). */
export function requireEnv(name: WorkerEnvVar): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name} (ver PRD §13 / .env.example).`,
    );
  }
  return value;
}

/** Valida o conjunto do worker no boot. Hoje só avisa (ver nota acima). */
export function validateEnv(): void {
  const missing: WorkerEnvVar[] = WORKER_ENV_VARS.filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    console.warn(
      `[worker][env] variáveis ausentes (esperado no esqueleto): ${missing.join(', ')}. ` +
        'Configure-as via .env (ver .env.example). Serão obrigatórias a partir da impl 004.',
    );
  }
}
