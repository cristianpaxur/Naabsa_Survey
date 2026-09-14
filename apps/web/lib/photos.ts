import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';
import type { ServerClient } from '@/lib/supabase/server';
import type { UIPhoto, PhotoStatus } from '@/components/photos/types';
import type { Crop } from '@/lib/actions/photos';

const BUCKET = 'reports';
const SIGNED_TTL = 600; // 10 min (RNF-05)

interface PhotoDbRow {
  id: string;
  status: string;
  thumb_path: string | null;
  processed_path: string | null;
  slot_id: string | null;
  position: number;
  crop: Crop | null;
  original_path: string;
  error_message: string | null;
  ai_suggested: boolean;
  quality_flags: string[];
  ai_status: UIPhoto['aiStatus'];
  ai_error: string | null;
}

/** Rótulo curto/mono a partir do caminho do original (uuid abreviado). */
function shortLabel(originalPath: string): string {
  const file = originalPath.split('/').pop() ?? '';
  const uuid = file.replace(/\.[^.]+$/, '');
  return `IMG_${uuid.slice(0, 6)}`;
}

/**
 * Carrega as fotos do relatório como `UIPhoto[]`, resolvendo URLs assinadas
 * (≤ 10 min — RNF-05) para thumb e processada. A leitura de linhas usa o
 * cliente do usuário (RLS); a assinatura usa o service client.
 */
export async function loadUIPhotos(
  supabase: ServerClient,
  service: SupabaseClient<Database>,
  reportId: string,
): Promise<UIPhoto[]> {
  const { data, error } = await supabase
    .from('report_photos')
    .select(
      'id,status,thumb_path,processed_path,slot_id,position,crop,original_path,error_message,ai_suggested,quality_flags,ai_status,ai_error',
    )
    .eq('report_id', reportId)
    .is('removed_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error('Não foi possível carregar as fotos. Tente atualizar novamente.');
  const rows = (data as PhotoDbRow[] | null) ?? [];

  // Coleta os paths a assinar e gera as URLs em lote por bucket.
  const paths = new Set<string>();
  for (const r of rows) {
    if (r.thumb_path) paths.add(r.thumb_path);
    if (r.processed_path) paths.add(r.processed_path);
  }
  const signed = new Map<string, string>();
  if (paths.size > 0) {
    const { data: urls, error: signingError } = await service.storage
      .from(BUCKET)
      .createSignedUrls(Array.from(paths), SIGNED_TTL);
    if (signingError || !urls || urls.some((u) => !u.signedUrl)) {
      throw new Error('Não foi possível carregar as imagens. Tente atualizar novamente.');
    }
    for (const u of urls ?? []) {
      if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    status: (r.status as PhotoStatus) ?? 'pending',
    thumbUrl: r.thumb_path ? (signed.get(r.thumb_path) ?? null) : null,
    processedUrl: r.processed_path
      ? (signed.get(r.processed_path) ?? null)
      : null,
    slotId: r.slot_id,
    position: r.position,
    crop: r.crop,
    label: shortLabel(r.original_path),
    errorMessage: r.error_message,
    aiSuggested: r.ai_suggested,
    qualityFlags: r.quality_flags ?? [],
    aiStatus: r.ai_status ?? 'idle',
    aiError: r.ai_error,
  }));
}
