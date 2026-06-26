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
export const BUILD_WORKING_DOCX_QUEUE = 'build_working_docx';
export const RENDER_SHEETS_QUEUE = 'render_sheets';
export const AI_REVIEW_QUEUE = 'ai_review';

// Persistir o singleton no globalThis evita VAZAMENTO de pools no HMR do Next dev:
// sem isso, cada reload reavalia o módulo, recria o PgBoss e deixa o anterior com
// conexões abertas — estourando o limite do pooler do Supabase (session mode ~15).
const globalForBoss = globalThis as unknown as { __naabsaWebBoss?: Promise<PgBoss> };

async function getBoss(): Promise<PgBoss> {
  if (globalForBoss.__naabsaWebBoss) return globalForBoss.__naabsaWebBoss;
  const p = (async () => {
    const connectionString = process.env.DATABASE_URL ?? '';
    if (!connectionString) {
      throw new Error('DATABASE_URL ausente — não é possível enfileirar jobs.');
    }
    // O web apenas ENVIA jobs → pool pequeno (o pooler do Supabase é limitado).
    const boss = new PgBoss({ connectionString, max: 2 });
    boss.on('error', (err: Error) => {
      console.error('[web][pg-boss] erro:', err);
    });
    try {
      await boss.start();
      // Idempotente: garante as filas caso o worker ainda não as tenha criado.
      for (const q of [PROCESS_PHOTO_QUEUE, GENERATE_PDF_QUEUE, PREVIEW_PDF_QUEUE, BUILD_WORKING_DOCX_QUEUE, RENDER_SHEETS_QUEUE, AI_REVIEW_QUEUE]) {
        await boss.createQueue(q).catch(() => {
          /* já existe */
        });
      }
      return boss;
    } catch (err) {
      // Se o start falhou (ex.: pooler cheio), LIBERA o pool — senão as conexões
      // abertas vazam e pioram o limite. O cache é limpo abaixo para retentar.
      await boss.stop({ graceful: false }).catch(() => {});
      throw err;
    }
  })();
  globalForBoss.__naabsaWebBoss = p;
  // Não cacheia falha: limpa o singleton para a próxima requisição tentar de novo.
  p.catch(() => {
    if (globalForBoss.__naabsaWebBoss === p) globalForBoss.__naabsaWebBoss = undefined;
  });
  return p;
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

/** Enfileira a montagem do `working.docx` editável (012/T-002) — entrada em `editing`.
 * `singletonKey` por relatório dedupe builds em recarregamentos rápidos da página. */
export async function enqueueBuildWorkingDocx(
  payload: GeneratePdfPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(BUILD_WORKING_DOCX_QUEUE, payload, {
    singletonKey: payload.reportId,
    singletonSeconds: 120,
  });
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

/** Enfileira a revisão por IA pós-extração (010/T-007; no-op se AI_ENABLED=off). */
export async function enqueueAiReview(
  payload: GeneratePdfPayload,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(AI_REVIEW_QUEUE, payload);
}
