/**
 * Entrypoint do worker Naabsa.
 *
 * Esqueleto (impl 001): valida o ambiente, declara os jobs (serão registrados
 * no pg-boss na impl 004), loga "worker pronto" e fica vivo até receber um sinal
 * de término, encerrando de forma limpa. Em modo smoke (WORKER_SMOKE=1) sobe e
 * encerra imediatamente — usado para verificação automatizada.
 */
import { validateEnv } from './lib/env';
import { processPhoto } from './jobs/processPhoto';
import { generatePdf } from './jobs/generatePdf';
import { retentionPurge } from './jobs/retentionPurge';
import { aiReview } from './jobs/aiReview';

/** Mapa nome-da-fila → handler. Registrado no pg-boss na implementação 004. */
const JOBS = {
  process_photo: processPhoto,
  generate_pdf: generatePdf,
  retention_purge: retentionPurge,
  ai_review: aiReview,
} as const;

async function main(): Promise<void> {
  validateEnv();

  // Aqui a impl 004 conectará o pg-boss e fará boss.work(nome, handler).
  console.log(`[worker] jobs disponíveis: ${Object.keys(JOBS).join(', ')}`);
  console.log('[worker] worker pronto');

  await new Promise<void>((resolve) => {
    const stop = (signal: string): void => {
      console.log(`[worker] recebido ${signal}, encerrando…`);
      // A impl 004+ fechará aqui pg-boss e o Chromium singleton.
      resolve();
    };

    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));

    if (process.env.WORKER_SMOKE === '1') {
      stop('SMOKE');
    }
  });

  console.log('[worker] encerrado com sucesso');
}

main().catch((err: unknown) => {
  console.error('[worker] falha no boot:', err);
  process.exit(1);
});
