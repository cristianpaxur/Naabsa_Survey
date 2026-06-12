/**
 * Hook de instrumentação do Next.js — roda uma vez no boot do servidor.
 * Usado aqui para validar o ambiente (PRD §13). Ver apps/web/lib/env.ts.
 */
export async function register(): Promise<void> {
  // Só no runtime Node (não no Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env');
    validateEnv();
  }
}
