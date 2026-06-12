/**
 * Bootstrap do pg-boss (implementação 007 — criado aqui pois a 004 ainda não
 * rodou). pg-boss usa PostgreSQL diretamente (DATABASE_URL) como backend de fila.
 *
 * Expõe um singleton `getBoss()` que inicia o pg-boss sob demanda e
 * `stopBoss()` para shutdown limpo. O índice do worker registra os handlers
 * (`registerJobs`) e mantém o processo vivo enquanto o boss estiver ativo.
 */
import { PgBoss } from 'pg-boss';
import { requireEnv } from './env';

/** Nome da fila de processamento de foto (compartilhado com o web via send). */
export const PROCESS_PHOTO_QUEUE = 'process_photo';

/**
 * Concorrência máxima do processamento de foto (RNF-04). No pg-boss v12 isto é
 * `localConcurrency` (substituiu o antigo `teamSize`): nº de jobs processados
 * em paralelo por nó. 4 fotos simultâneas; a 5ª aguarda.
 */
export const PROCESS_PHOTO_CONCURRENCY = 4;

/** Tentativas antes de marcar a foto com erro recuperável (T-003). */
export const PROCESS_PHOTO_RETRY_LIMIT = 3;

let bossPromise: Promise<PgBoss> | null = null;

/**
 * Retorna o singleton do pg-boss, iniciando-o no primeiro acesso. Cria as
 * tabelas do schema `pgboss` se ainda não existirem (idempotente).
 */
export async function getBoss(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;

  bossPromise = (async () => {
    const boss = new PgBoss({
      connectionString: requireEnv('DATABASE_URL'),
      // Mantém o backend leve; o monitoramento padrão é suficiente.
    });
    boss.on('error', (err: Error) => {
      console.error('[worker][pg-boss] erro:', err);
    });
    await boss.start();
    return boss;
  })();

  return bossPromise;
}

/** Encerra o pg-boss de forma limpa (idempotente). */
export async function stopBoss(): Promise<void> {
  if (!bossPromise) return;
  const boss = await bossPromise;
  bossPromise = null;
  await boss.stop({ graceful: true });
}
