import 'server-only';
import { PgBoss } from 'pg-boss';

/**
 * Enfileiramento de jobs pelo lado web (route handlers). Usa pg-boss apenas
 * para `send` — o consumo/processamento é responsabilidade do worker. Mantemos
 * um singleton iniciado sob demanda; o handler não consome filas.
 *
 * O nome da fila espelha o worker (apps/worker/src/lib/boss.ts).
 */
export const PROCESS_PHOTO_QUEUE = 'process_photo';
export const GENERATE_PDF_QUEUE = 'generate_pdf';
export const PREVIEW_PDF_QUEUE = 'preview_pdf';
export const RENDER_SHEETS_QUEUE = 'render_sheets';

let bossPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;
  bossPromise = (async () => {
    const connectionString = process.env.DATABASE_URL ?? '';
    if (!connectionString) {
      throw new Error('DATABASE_URL ausente — não é possível enfileirar jobs.');
    }
    const boss = new PgBoss({ connectionString });
    boss.on('error', (err: Error) => {
      console.error('[web][pg-boss] erro:', err);
    });
    await boss.start();
    // Idempotente: garante as filas caso o worker ainda não as tenha criado.
    await boss.createQueue(PROCESS_PHOTO_QUEUE).catch(() => {
      /* já existe */
    });
    await boss.createQueue(GENERATE_PDF_QUEUE).catch(() => {
      /* já existe */
    });
    await boss.createQueue(PREVIEW_PDF_QUEUE).catch(() => {
      /* já existe */
    });
    await boss.createQueue(RENDER_SHEETS_QUEUE).catch(() => {
      /* já existe */
    });
    return boss;
  })();
  return bossPromise;
}

export interface ProcessPhotoPayload {
  photoId: string;
  reportId: string;
}

/** Enfileira o processamento de uma foto. Retorna o id do job (ou null). */
export async function enqueueProcessPhoto(
  payload: ProcessPhotoPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(PROCESS_PHOTO_QUEUE, payload);
}

export interface GeneratePdfPayload {
  reportId: string;
}

/** Enfileira a geração do PDF de um relatório (008/T-008). */
export async function enqueueGeneratePdf(
  payload: GeneratePdfPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(GENERATE_PDF_QUEUE, payload);
}

/** Enfileira a geração do PDF de PRÉ-VISUALIZAÇÃO (não transiciona o estado). */
export async function enqueuePreviewPdf(
  payload: GeneratePdfPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(PREVIEW_PDF_QUEUE, payload);
}

export interface RenderSheetsPayload {
  reportId: string;
}

/** Enfileira a renderização das abas da planilha como imagem (print pixel-perfeito). */
export async function enqueueRenderSheets(
  payload: RenderSheetsPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(RENDER_SHEETS_QUEUE, payload);
}
