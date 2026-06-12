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
    // Idempotente: garante a fila caso o worker ainda não a tenha criado.
    await boss.createQueue(PROCESS_PHOTO_QUEUE).catch(() => {
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
