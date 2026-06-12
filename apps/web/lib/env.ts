/**
 * Validação de ambiente do app web (PRD §13).
 *
 * Fundação (impl 001): valida presença e emite AVISO para variáveis ausentes,
 * sem quebrar `next dev`/`next build` (o desenvolvedor pode não ter `.env` ainda).
 * A implementação 005 (Autenticação) endurece isto: variáveis realmente
 * requeridas passam a LANÇAR em produção.
 */

/** Variáveis lidas pelo app web (subconjunto do PRD §13). */
const WEB_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'APP_BASE_URL',
] as const;

type WebEnvVar = (typeof WEB_ENV_VARS)[number];

/** Lê uma variável obrigatória; lança se ausente (uso sob demanda). */
export function requireEnv(name: WebEnvVar): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name} (ver PRD §13 / .env.example).`,
    );
  }
  return value;
}

/** Valida o conjunto do web no boot. Hoje só avisa (ver nota acima). */
export function validateEnv(): void {
  const missing: WebEnvVar[] = WEB_ENV_VARS.filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    console.warn(
      `[env] variáveis ausentes (esperado no esqueleto): ${missing.join(', ')}. ` +
        'Configure-as via .env (ver .env.example). Serão obrigatórias a partir da impl 005.',
    );
  }
}
