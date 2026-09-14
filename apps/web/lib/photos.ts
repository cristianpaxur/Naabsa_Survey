import 'server-only';
import type { ServerClient } from '@/lib/supabase/server';
import type { UIPhoto, PhotoStatus } from '@/components/photos/types';
import type { Crop } from '@/lib/actions/photos';


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

/** URLs da própria origem; a rota de imagem revalida sessão/RLS em cada leitura. */
export async function loadUIPhotos(
  supabase: ServerClient,
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

  return rows.map((r) => ({
    id: r.id,
    status: (r.status as PhotoStatus) ?? 'pending',
    thumbUrl: r.status === 'done' && (r.thumb_path || r.processed_path)
      ? `/api/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(r.id)}/image?size=thumb` : null,
    processedUrl: r.status === 'done' && r.processed_path
      ? `/api/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(r.id)}/image?size=full` : null,
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
