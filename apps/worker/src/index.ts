/**
 * Entrypoint do worker Naabsa.
 *
 * impl 007: conecta o pg-boss (bootstrap em lib/boss.ts — criado aqui pois a 004
 * ainda não rodou) e registra o job `process_photo` com concorrência 4 (RNF-04).
 * Os demais jobs (generate_pdf, retention_purge, ai_review) permanecem stubs até
 * suas implementações; ficam mapeados mas não são consumidos ainda.
 *
 * Em modo smoke (WORKER_SMOKE=1) sobe e encerra imediatamente sem conectar ao
 * pg-boss — usado para verificação automatizada sem DATABASE_URL.
 */
import { validateEnv } from './lib/env';
import {
  getBoss,
  stopBoss,
  PROCESS_PHOTO_QUEUE,
  PROCESS_PHOTO_CONCURRENCY,
  PROCESS_PHOTO_RETRY_LIMIT,
} from './lib/boss';
import {
  processPhoto,
  markPhotoError,
  type ProcessPhotoPayload,
} from './jobs/processPhoto';
import { generatePdf } from './jobs/generatePdf';
import { retentionPurge } from './jobs/retentionPurge';
import { aiReview } from './jobs/aiReview';

/** Mapa nome-da-fila → handler. Apenas process_photo é consumido na impl 007. */
const JOBS = {
  process_photo: processPhoto,
  generate_pdf: generatePdf,
  retention_purge: retentionPurge,
  ai_review: aiReview,
} as const;

async function registerJobs(): Promise<void> {
  const boss = await getBoss();

  // Garante a fila (pg-boss v12 exige createQueue antes de work/send) com a
  // política de retry. retryLimit aqui vale para todos os jobs enfileirados.
  await boss.createQueue(PROCESS_PHOTO_QUEUE, {
    retryLimit: PROCESS_PHOTO_RETRY_LIMIT,
    retryDelay: 2,
    retryBackoff: true,
  });

  // includeMetadata: true expõe retryCount/retryLimit para decidir o dead-letter.
  await boss.work<ProcessPhotoPayload>(
    PROCESS_PHOTO_QUEUE,
    { localConcurrency: PROCESS_PHOTO_CONCURRENCY, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await processPhoto(job.data);
        } catch (err) {
          // Última tentativa esgotada: marca a foto com erro recuperável e NÃO
          // relança (o lote segue). Caso contrário, propaga para o retry.
          const isLastAttempt = job.retryCount >= job.retryLimit;
          if (isLastAttempt) {
            await markPhotoError(
              job.data.photoId,
              err instanceof Error ? err.message : String(err),
            );
          } else {
            throw err;
          }
        }
      }
    },
  );

  console.log(
    `[worker] consumindo '${PROCESS_PHOTO_QUEUE}' (localConcurrency ${PROCESS_PHOTO_CONCURRENCY})`,
  );
}

async function main(): Promise<void> {
  validateEnv();
  console.log(`[worker] jobs disponíveis: ${Object.keys(JOBS).join(', ')}`);

  if (process.env.WORKER_SMOKE === '1') {
    console.log('[worker] modo smoke — sem pg-boss; encerrando');
    return;
  }

  await registerJobs();
  console.log('[worker] worker pronto');

  await new Promise<void>((resolve) => {
    const stop = (signal: string): void => {
      console.log(`[worker] recebido ${signal}, encerrando…`);
      stopBoss()
        .catch((err: unknown) =>
          console.error('[worker] erro ao parar pg-boss:', err),
        )
        .finally(resolve);
    };
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));
  });

  console.log('[worker] encerrado com sucesso');
}

main().catch((err: unknown) => {
  console.error('[worker] falha no boot:', err);
  process.exit(1);
});
