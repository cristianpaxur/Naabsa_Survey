/**
 * Job `process_photo` — implementação 007 (PRD T-15 / RF-16).
 *
 * Pipeline sharp por foto:
 *   EXIF auto-orientation → JPEG qualidade 82 → lado maior ≤ 2500 px (sem
 *   ampliar) → thumbnail 400 px no lado maior → sRGB. Salva processada e thumb
 *   no Storage e grava os paths em `report_photos`. Concorrência 4 (RNF-04,
 *   configurada no boss.work do índice).
 *
 * Após esgotar os retries do pg-boss a foto é marcada com `status: 'error'` e
 * `error_message` (tratada pelo handler de falha no índice), sem travar o lote.
 */
import sharp from 'sharp';
import { getServiceClient } from '../lib/supabase';

const BUCKET = 'reports';
const MAX_EDGE = 2500;
const THUMB_EDGE = 400;
const JPEG_QUALITY = 82;

export interface ProcessPhotoPayload {
  photoId: string;
  reportId: string;
}

export interface TransformResult {
  processed: Buffer;
  thumb: Buffer;
}

/**
 * Núcleo puro do pipeline sharp (testável sem Storage): EXIF auto-orientation,
 * sRGB, JPEG q82, lado maior ≤ 2500 px (processada) e ≤ 400 px (thumb), sem
 * ampliar imagens menores. Recebe e devolve buffers.
 */
export async function transformImage(input: Buffer): Promise<TransformResult> {
  // rotate() sem argumentos aplica a orientação do EXIF e remove o metadado.
  const base = sharp(input).rotate().toColorspace('srgb');

  const processed = await base
    .clone()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const thumb = await base
    .clone()
    .resize({
      width: THUMB_EDGE,
      height: THUMB_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { processed, thumb };
}

/** Caminho da processada/thumb a partir do original, preservando o uuid. */
function derivePaths(
  reportId: string,
  originalPath: string,
): { uuid: string; processedPath: string; thumbPath: string } {
  // original: {reportId}/photos/original/{uuid}.ext
  const file = originalPath.split('/').pop() ?? '';
  const uuid = file.replace(/\.[^.]+$/, '');
  return {
    uuid,
    processedPath: `${reportId}/photos/processed/${uuid}.jpg`,
    thumbPath: `${reportId}/photos/thumbs/${uuid}.jpg`,
  };
}

/**
 * Processa uma única foto. Lança em caso de erro (sharp/Storage) para que o
 * pg-boss faça retry; quando os retries esgotam o índice marca a foto com erro.
 */
export async function processPhoto(
  payload: ProcessPhotoPayload,
): Promise<void> {
  const { photoId, reportId } = payload;
  const supabase = getServiceClient();

  const { data: row, error: rowErr } = await supabase
    .from('report_photos')
    .select('id,original_path')
    .eq('id', photoId)
    .single();
  if (rowErr || !row) {
    throw new Error(
      `report_photos ${photoId} não encontrada: ${rowErr?.message ?? 'sem linha'}`,
    );
  }
  const originalPath = (row as { original_path: string }).original_path;

  // Baixa o original do Storage.
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(originalPath);
  if (dlErr || !blob) {
    throw new Error(
      `Falha ao baixar original ${originalPath}: ${dlErr?.message ?? 'sem dados'}`,
    );
  }
  const input = Buffer.from(await blob.arrayBuffer());

  const { processed, thumb } = await transformImage(input);

  const { processedPath, thumbPath } = derivePaths(reportId, originalPath);

  const upProcessed = await supabase.storage
    .from(BUCKET)
    .upload(processedPath, processed, {
      upsert: true,
      contentType: 'image/jpeg',
    });
  if (upProcessed.error) {
    throw new Error(`Falha ao subir processada: ${upProcessed.error.message}`);
  }

  const upThumb = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (upThumb.error) {
    throw new Error(`Falha ao subir thumb: ${upThumb.error.message}`);
  }

  const { error: updErr } = await supabase
    .from('report_photos')
    .update({
      processed_path: processedPath,
      thumb_path: thumbPath,
      status: 'done',
      error_message: null,
    } as never)
    .eq('id', photoId);
  if (updErr) {
    throw new Error(`Falha ao atualizar linha: ${updErr.message}`);
  }
}

/**
 * Marca a foto com erro recuperável após esgotar os retries (T-003). Chamado
 * pelo handler `onComplete`/dead-letter do índice. Não lança — best-effort.
 */
export async function markPhotoError(
  photoId: string,
  message: string,
): Promise<void> {
  try {
    const supabase = getServiceClient();
    await supabase
      .from('report_photos')
      .update({
        status: 'error',
        error_message: message.slice(0, 500),
      } as never)
      .eq('id', photoId);
  } catch (err) {
    console.error('[worker][processPhoto] falha ao marcar erro:', err);
  }
}
