'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { PhotoSlot } from '@naabsa/core';
import { allocate, saveCrop, advance, confirmAllSuggestions, type Crop } from '@/lib/actions/photos';
import { pendingRequiredSlots } from '@/lib/photo-gate';
import { Gallery } from './Gallery';
import { SlotList } from './SlotList';
import { CropModal } from './CropModal';
import { AiBanner } from './AiBanner';
import type { UIPhoto } from './types';

export interface PhotosClientProps {
  reportId: string;
  vesselName: string | null;
  metaLabel: string;
  slots: PhotoSlot[];
  initialPhotos: UIPhoto[];
}

/**
 * Orquestrador da tela de fotos (tela 05). Mantém o estado das fotos, faz o
 * upload em lote, polling do processamento, drag-and-drop para os slots
 * (dnd-kit), fallback por clique "Alocar", crop modal e o gate de avanço.
 */
export function PhotosClient({
  reportId,
  vesselName,
  metaLabel,
  slots,
  initialPhotos,
}: PhotosClientProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<UIPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropPhotoId, setCropPhotoId] = useState<string | null>(null);
  // Foto selecionada na galeria para o fallback por clique em "Alocar".
  const [picked, setPicked] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [confirmingAi, setConfirmingAi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const aiSuggestedCount = photos.filter((p) => p.aiSuggested).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/reports/${reportId}/photos/list`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const json = (await res.json()) as { photos: UIPhoto[] };
    setPhotos(json.photos);
  }, [reportId]);

  // Polling em tempo real: enquanto houver foto PROCESSANDO ou dentro da janela
  // pós-upload — a sugestão da IA acontece DEPOIS do processamento, então não basta
  // parar quando tudo fica "pronto" (senão a pré-alocação só apareceria ao recarregar).
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const pollUntilRef = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      const pending = photosRef.current.some((p) => p.status === 'pending');
      if (pending || Date.now() < pollUntilRef.current) void refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  async function onConfirmAllAi() {
    setConfirmingAi(true);
    setError(null);
    const res = await confirmAllSuggestions(reportId);
    setConfirmingAi(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    await refresh();
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    const res = await fetch(`/api/reports/${reportId}/photos`, {
      method: 'POST',
      body: fd,
    });
    const json = (await res.json()) as {
      photoIds?: string[];
      rejected?: { name: string; reason: string }[];
      error?: string;
    };
    if (!res.ok && res.status !== 202) {
      setError(json.error ?? 'Falha no upload.');
    } else if (json.rejected && json.rejected.length > 0) {
      setError(
        `Ignorados: ${json.rejected.map((r) => `${r.name} (${r.reason})`).join('; ')}`,
      );
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    // Mantém o polling por ~60s para capturar o processamento + a sugestão da IA
    // em tempo real (sem o usuário precisar recarregar).
    pollUntilRef.current = Date.now() + 60_000;
    await refresh();
  }

  // Mapa foto alocada por slot (ordenada por position).
  const photosBySlot = useMemo(() => {
    const map: Record<string, UIPhoto[]> = {};
    for (const p of photos) {
      if (!p.slotId) continue;
      (map[p.slotId] ??= []).push(p);
    }
    for (const k of Object.keys(map)) {
      map[k]!.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [photos]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of slots) c[s.id] = photosBySlot[s.id]?.length ?? 0;
    return c;
  }, [slots, photosBySlot]);

  const pending = pendingRequiredSlots(slots, counts);
  const canAdvance = pending.length === 0;

  async function doAllocate(photoId: string, slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    const position = photosBySlot[slotId]?.length ?? 0;
    if (slot?.max !== undefined && position >= slot.max) {
      setError(`Slot "${slot.label}" cheio (máx. ${slot.max}).`);
      return;
    }
    const result = await allocate(reportId, photoId, slotId, position);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPicked(null);
    await refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    const photoId = e.active.data.current?.photoId as string | undefined;
    const slotId = e.over?.data.current?.slotId as string | undefined;
    if (photoId && slotId) void doAllocate(photoId, slotId);
  }

  function onClickAllocate(slotId: string) {
    if (picked) {
      void doAllocate(picked, slotId);
    } else {
      setError('Selecione uma foto na galeria e clique em "Alocar".');
    }
  }

  async function onSaveCrop(crop: Crop) {
    if (!cropPhotoId) return;
    const result = await saveCrop(reportId, cropPhotoId, crop);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    void refresh();
  }

  async function onAdvance() {
    setAdvancing(true);
    setError(null);
    const result = await advance(reportId);
    setAdvancing(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/reports/${reportId}/edit`);
  }

  const cropPhoto = photos.find((p) => p.id === cropPhotoId) ?? null;
  const cropSlot = cropPhoto?.slotId
    ? slots.find((s) => s.id === cropPhoto.slotId)
    : null;

  return (
    <div style={{ padding: '26px 32px 40px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            style={{
              fontSize: 23,
              fontWeight: 800,
              letterSpacing: '-.01em',
              margin: 0,
            }}
          >
            Fotos
          </h1>
          <span style={{ fontSize: 13, color: 'var(--rocha)' }}>
            {vesselName ?? '—'} · {metaLabel}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--rocha)', marginTop: 5 }}>
          Arraste uma foto da galeria para o slot (ou selecione e clique em
          “Alocar”). Avanço bloqueado enquanto slots obrigatórios não estiverem
          completos.
        </div>
      </div>

      <AiBanner count={aiSuggestedCount} busy={confirmingAi} onConfirmAll={() => void onConfirmAllAi()} />

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            background: '#fbeceb',
            border: '1px solid #f0c4c2',
            borderRadius: 9,
            padding: '10px 13px',
            fontSize: 13,
            color: '#9b2a2c',
          }}
        >
          {error}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic"
        multiple
        hidden
        onChange={(e) => void onUpload(e.target.files)}
      />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.15fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* Galeria à esquerda */}
          <div
            style={{
              border: '1px solid #ece8e1',
              borderRadius: 14,
              background: '#fff',
              padding: 18,
            }}
          >
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                width: '100%',
                marginBottom: 16,
                height: 42,
                border: '1.5px solid var(--navy)',
                borderRadius: 10,
                background: '#fff',
                color: 'var(--navy)',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: uploading ? 'wait' : 'pointer',
              }}
            >
              {uploading ? 'Enviando…' : '+ Enviar fotos (jpg/png/heic)'}
            </button>

            {picked && (
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 12,
                  color: 'var(--navy)',
                  fontWeight: 600,
                }}
              >
                Foto selecionada — clique em “Alocar” no slot desejado.{' '}
                <button
                  onClick={() => setPicked(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--rocha)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  cancelar
                </button>
              </div>
            )}

            <GalleryPicker
              photos={photos}
              picked={picked}
              onPick={setPicked}
            />
            {/* Realce visual da foto selecionada via borda na própria galeria
                não é necessário aqui — a barra acima indica a seleção. */}
          </div>

          {/* Slots à direita */}
          <div>
            <SlotList
              slots={slots}
              photosBySlot={photosBySlot}
              onCrop={setCropPhotoId}
              onClickAllocate={onClickAllocate}
            />

            <button
              onClick={() => void onAdvance()}
              disabled={!canAdvance || advancing}
              style={{
                marginTop: 16,
                width: '100%',
                height: 46,
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                background: canAdvance ? 'var(--navy)' : '#dcd8d0',
                color: canAdvance ? '#fff' : '#8a8276',
                cursor: canAdvance && !advancing ? 'pointer' : 'not-allowed',
              }}
            >
              {advancing ? 'Avançando…' : 'Avançar para edição →'}
            </button>
          </div>
        </div>
      </DndContext>

      {cropPhoto && cropPhoto.processedUrl && cropSlot && (
        <CropModal
          imageUrl={cropPhoto.processedUrl}
          aspect={cropSlot.aspect}
          slotLabel={cropSlot.label}
          initialCrop={cropPhoto.crop}
          onClose={() => setCropPhotoId(null)}
          onSave={onSaveCrop}
        />
      )}
    </div>
  );
}

/** Galeria com seleção por clique (para o fallback "Alocar"). */
function GalleryPicker({
  photos,
  picked,
  onPick,
}: {
  photos: UIPhoto[];
  picked: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest('[data-photo-id]');
        const id = el?.getAttribute('data-photo-id');
        const p = photos.find((x) => x.id === id);
        if (id && p && p.status === 'done') onPick(id);
      }}
    >
      <div style={{ outline: picked ? '0' : '0' }}>
        <Gallery photos={photos} />
      </div>
    </div>
  );
}
