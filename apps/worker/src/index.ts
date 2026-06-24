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
import {
  generatePdf,
  GENERATE_PDF_QUEUE,
  GENERATE_PDF_CONCURRENCY,
  GENERATE_PDF_RETRY_LIMIT,
  type GeneratePdfPayload,
} from './jobs/generatePdf';
import {
  previewPdf,
  PREVIEW_PDF_QUEUE,
  PREVIEW_PDF_CONCURRENCY,
  PREVIEW_PDF_RETRY_LIMIT,
  type PreviewPdfPayload,
} from './jobs/previewPdf';
import {
  renderSheets,
  RENDER_SHEETS_QUEUE,
  RENDER_SHEETS_CONCURRENCY,
  RENDER_SHEETS_RETRY_LIMIT,
  type RenderSheetsPayload,
} from './jobs/renderSheets';
import { closeBrowser } from './lib/browser';
import {
  retentionPurge,
  RETENTION_PURGE_QUEUE,
  RETENTION_PURGE_CRON,
} from './jobs/retentionPurge';
import { aiReview } from './jobs/aiReview';

/** Mapa nome-da-fila → handler. Apenas process_photo é consumido na impl 007. */
const JOBS = {
  process_photo: processPhoto,
  generate_pdf: generatePdf,
  preview_pdf: previewPdf,
  render_sheets: renderSheets,
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

  // generate_pdf — concorrência 1 (RNF-04)
  await boss.createQueue(GENERATE_PDF_QUEUE, {
    retryLimit: GENERATE_PDF_RETRY_LIMIT,
    retryDelay: 5,
    retryBackoff: true,
  });
  await boss.work<GeneratePdfPayload>(
    GENERATE_PDF_QUEUE,
    { localConcurrency: GENERATE_PDF_CONCURRENCY, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await generatePdf(job.data);
        } catch (err) {
          console.error(`[worker][generate_pdf] erro no job ${job.id}:`, err);
          throw err; // pg-boss faz retry
        }
      }
    },
  );
  console.log(
    `[worker] consumindo '${GENERATE_PDF_QUEUE}' (localConcurrency ${GENERATE_PDF_CONCURRENCY})`,
  );

  // preview_pdf — gera o PDF real para pré-visualização (serializado com generate_pdf)
  await boss.createQueue(PREVIEW_PDF_QUEUE, {
    retryLimit: PREVIEW_PDF_RETRY_LIMIT,
    retryDelay: 3,
    retryBackoff: true,
  });
  await boss.work<PreviewPdfPayload>(
    PREVIEW_PDF_QUEUE,
    { localConcurrency: PREVIEW_PDF_CONCURRENCY, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await previewPdf(job.data);
        } catch (err) {
          console.error(`[worker][preview_pdf] erro no job ${job.id}:`, err);
          throw err;
        }
      }
    },
  );
  console.log(
    `[worker] consumindo '${PREVIEW_PDF_QUEUE}' (localConcurrency ${PREVIEW_PDF_CONCURRENCY})`,
  );

  // render_sheets — concorrência 1 (LibreOffice é pesado)
  await boss.createQueue(RENDER_SHEETS_QUEUE, {
    retryLimit: RENDER_SHEETS_RETRY_LIMIT,
    retryDelay: 5,
    retryBackoff: true,
  });
  await boss.work<RenderSheetsPayload>(
    RENDER_SHEETS_QUEUE,
    { localConcurrency: RENDER_SHEETS_CONCURRENCY, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await renderSheets(job.data);
        } catch (err) {
          console.error(`[worker][render_sheets] erro no job ${job.id}:`, err);
          throw err;
        }
      }
    },
  );
  console.log(
    `[worker] consumindo '${RENDER_SHEETS_QUEUE}' (localConcurrency ${RENDER_SHEETS_CONCURRENCY})`,
  );

  // retention_purge — cron diário (010/T-001): purga blobs de relatórios antigos.
  await boss.createQueue(RETENTION_PURGE_QUEUE, { retryLimit: 1 });
  await boss.work(RETENTION_PURGE_QUEUE, async () => {
    try {
      await retentionPurge();
    } catch (err) {
      console.error('[worker][retention_purge] erro:', err);
      throw err;
    }
  });
  await boss.schedule(RETENTION_PURGE_QUEUE, RETENTION_PURGE_CRON);
  console.log(`[worker] cron '${RETENTION_PURGE_QUEUE}' agendado (${RETENTION_PURGE_CRON})`);
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
      Promise.all([
        stopBoss().catch((err: unknown) => console.error('[worker] erro ao parar pg-boss:', err)),
        closeBrowser().catch((err: unknown) => console.error('[worker] erro ao fechar browser:', err)),
      ]).finally(resolve);
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
