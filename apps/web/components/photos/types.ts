import type { PhotoSlot } from '@naabsa/core';
import type { Crop } from '@/lib/actions/photos';

/** Estado de processamento de uma foto na galeria. */
export type PhotoStatus = 'pending' | 'done' | 'error';

/** Foto materializada para a UI (com URLs assinadas resolvidas no servidor). */
export interface UIPhoto {
  id: string;
  status: PhotoStatus;
  /** URL assinada do thumb (≤ 10 min); null enquanto processando/erro. */
  thumbUrl: string | null;
  /** URL assinada da processada (usada no crop); null enquanto processando. */
  processedUrl: string | null;
  slotId: string | null;
  position: number;
  crop: Crop | null;
  /** Nome curto/mono exibido sobre o thumb. */
  label: string;
  errorMessage: string | null;
  /** Forward-compatible (006/010) — render apenas, sem lógica de IA aqui. */
  aiSuggested: boolean;
  qualityFlags: string[];
}

export type { PhotoSlot };
