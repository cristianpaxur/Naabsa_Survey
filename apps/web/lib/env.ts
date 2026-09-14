/** Desenvolvimento: process.env > .env.local da raiz > .env da raiz. Container: ambiente injetado. */
const WEB_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'COLLABORA_URL', 'WOPI_PUBLIC_URL', 'WOPI_TOKEN_SECRET'] as const;
type WebEnvVar = (typeof WEB_ENV_VARS)[number] | 'APP_BASE_URL';

export function requireEnv(name: WebEnvVar): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}.`);
  return value;
}

export function environmentProblems(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const issues: string[] = WEB_ENV_VARS.filter((name) => !env[name]?.trim()).map((name) => `${name} ausente`);
  for (const name of ['SUPABASE_URL', 'COLLABORA_URL', 'WOPI_PUBLIC_URL', 'DATABASE_URL'] as const) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]!);
      if (!(name === 'DATABASE_URL' ? ['postgres:', 'postgresql:'] : ['http:', 'https:']).includes(url.protocol)) issues.push(`${name} inválida`);
    } catch { issues.push(`${name} inválida`); }
  }
  if (env.WOPI_TOKEN_SECRET && env.WOPI_TOKEN_SECRET.length < 32) issues.push('WOPI_TOKEN_SECRET deve ter pelo menos 32 caracteres');
  return issues;
}

export function validateEnv(): void {
  // Imagem standalone recebe segredos somente na execução, nunca no build.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const issues = environmentProblems();
  const blocking = issues.filter((issue) => process.env.NODE_ENV === 'production' || !issue.startsWith('WOPI_TOKEN_SECRET deve'));
  if (blocking.length) throw new Error(`[web][env] ${blocking.join('; ')}. Configure o ambiente antes de iniciar.`);
  if (issues.length) console.warn(`[web][env] ${issues.join('; ')}. Corrija antes de publicar.`);
}
