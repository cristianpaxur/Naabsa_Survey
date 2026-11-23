/** Desenvolvimento: process.env > .env.local da raiz > .env da raiz. Container: ambiente injetado. */
const WORKER_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'] as const;
type WorkerEnvVar = (typeof WORKER_ENV_VARS)[number];

export function requireEnv(name: WorkerEnvVar): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}.`);
  return value;
}

export function environmentProblems(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const issues: string[] = WORKER_ENV_VARS.filter((name) => !env[name]?.trim()).map((name) => `${name} ausente`);
  for (const name of ['SUPABASE_URL', 'DATABASE_URL'] as const) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]!);
      if (!(name === 'DATABASE_URL' ? ['postgres:', 'postgresql:'] : ['http:', 'https:']).includes(url.protocol)) issues.push(`${name} inválida`);
    } catch { issues.push(`${name} inválida`); }
  }
  const flag = (env.AI_ENABLED ?? 'false').trim().toLowerCase();
  if (!['true', '1', 'on', 'false', '0', 'off', ''].includes(flag)) issues.push('AI_ENABLED inválida');
  if (['true', '1', 'on'].includes(flag)) {
    const provider = (env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase();
    if (!['openai', 'anthropic'].includes(provider)) issues.push('AI_PROVIDER inválido');
    else if (!env[provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY']?.trim()) issues.push('Chave do provedor de IA ausente');
  }
  return issues;
}

export function validateEnv(): void {
  if (process.env.WORKER_SMOKE === '1') return;
  const issues = environmentProblems();
  if (issues.length) throw new Error(`[worker][env] ${issues.join('; ')}. Configure o ambiente antes de iniciar.`);
}
