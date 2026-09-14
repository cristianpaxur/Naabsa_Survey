'use client';

import './photos.css';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { PhotoSlot } from '@naabsa/core';
import { allocate, saveCrop, advance, confirmAllSuggestions, unallocate, removePhoto, retryPhoto, reorder, type ActionResult, type Crop } from '@/lib/actions/photos';
import { uploadPhotos } from '@/lib/photo-upload';
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
  const [uploadWait, setUploadWait] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropPhotoId, setCropPhotoId] = useState<string | null>(null);
  // Foto selecionada na galeria para o fallback por clique em "Alocar".
  const [picked, setPicked] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [confirmingAi, setConfirmingAi] = useState(false);
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const aiSuggestedCount = photos.filter((p) => p.aiSuggested).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const lastRefresh = useRef(Date.now());
  const refresh = useCallback(async (afterMutation = false): Promise<boolean> => {
    if (refreshInFlight.current) {
      const previous = await refreshInFlight.current;
      if (!afterMutation) return previous;
    }
    const request = (async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}/photos/list`, {
        cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json() as { photos?: UIPhoto[]; error?: string };
      if (!res.ok || !Array.isArray(json.photos)) throw new Error(json.error || 'Não foi possível atualizar as fotos.');
      setPhotos(json.photos);
      setRefreshError(null);
      lastRefresh.current = Date.now();
      return true;
    } catch {
      setRefreshError('Falha ao atualizar as fotos. As imagens atuais foram mantidas.');
      return false;
    }
    })();
    refreshInFlight.current = request;
    try { return await request; }
    finally { if (refreshInFlight.current === request) refreshInFlight.current = null; }
  }, [reportId]);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    const t = setInterval(() => {
      const pending = photosRef.current.some((p) => p.status === 'pending' || p.aiStatus === 'pending' || p.aiStatus === 'running');
      if (pending || Date.now() - lastRefresh.current > 4 * 60_000) void refresh();
    }, 2500);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(t); window.removeEventListener('focus', focus); };
  }, [refresh]);

  async function runAction(action: () => Promise<ActionResult>) {
    setBusy(true); setError(null);
    try {
      const result = await action();
      if ('error' in result) { setError(result.error); return false; }
      await refresh(true);
      return true;
    } catch { setError('Falha de conexão. Tente novamente.'); return false; }
    finally { setBusy(false); }
  }

  async function onConfirmAllAi() {
    setConfirmingAi(true);
    try { await runAction(() => confirmAllSuggestions(reportId)); }
    finally { setConfirmingAi(false); }
  }

  async function onUpload(files: File[] | FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError(null);
    try {
      const result = await uploadPhotos(reportId, Array.from(files), fetch, 60_000, { onWait: setUploadWait });
      setRetryFiles(result.retryFiles);
      if (result.messages.length) setError(`${result.accepted} foto(s) recebida(s). ${result.messages.join('; ')}`);
      await refresh(true);
    } catch { setError('Falha de conexão. Tente novamente.'); setRetryFiles(Array.from(files)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function openCrop(photoId: string) {
    if (await refresh(true)) setCropPhotoId(photoId);
  }

  async function changeOrder(photo: UIPhoto, direction: number) {
    if (!photo.slotId) return;
    const ordered = [...(photosBySlot[photo.slotId] ?? [])];
    const index = ordered.findIndex((p) => p.id === photo.id);
    const next = index + direction;
    if (next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
    await runAction(() => reorder(reportId, photo.slotId!, ordered.map((p) => p.id)));
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
    const assigned = (photosBySlot[slotId] ?? []).filter((p) => p.id !== photoId);
    const position = Math.max(-1, ...assigned.map((p) => p.position)) + 1;
    if (slot?.max !== undefined && assigned.length >= slot.max) {
      setError(`Slot "${slot.label}" cheio (máx. ${slot.max}).`);
      return;
    }
    if (await runAction(() => allocate(reportId, photoId, slotId, position))) setPicked(null);
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
    if (!cropPhotoId) return false;
    return runAction(() => saveCrop(reportId, cropPhotoId, crop));
  }

  async function onAdvance() {
    setAdvancing(true);
    try {
      if (await runAction(() => advance(reportId))) router.push(`/reports/${reportId}/edit`);
    } finally { setAdvancing(false); }
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
          “Alocar”). Fotos são opcionais. Sugestões da IA só entram no documento depois de confirmadas.
        </div>
      </div>

      <AiBanner count={aiSuggestedCount} busy={confirmingAi} onConfirmAll={() => void onConfirmAllAi()} />

      {refreshError && <div role="alert" style={{ marginBottom: 12 }}>
        {refreshError} <button onClick={() => void refresh()}>Atualizar fotos</button>
      </div>}
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
              {uploadWait !== null ? `Aguardando limite de envio (${uploadWait}s)…` : uploading ? 'Enviando…' : '+ Enviar fotos (jpg/png/heic)'}
            </button>

            {retryFiles.length > 0 && <div className="photo-card-actions" style={{ marginBottom: 12 }}><button disabled={uploading} onClick={() => void onUpload(retryFiles)}>
              Reenviar {retryFiles.length} foto(s) pendente(s)
            </button></div>}
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
              photos={photos} picked={picked} onPick={setPicked}
              renderActions={(photo) => <>
                {(photo.status !== 'done' || photo.aiStatus === 'error' || photo.aiStatus === 'pending' || photo.aiStatus === 'running') && !photo.slotId &&
                  <button disabled={busy} onClick={() => void runAction(() => retryPhoto(reportId, photo.id))}>Tentar novamente</button>}
                {photo.slotId && <>
                  <button disabled={busy} onClick={() => void runAction(() => unallocate(reportId, photo.id))}>Desalocar</button>
                  <button disabled={busy || photosBySlot[photo.slotId]?.[0]?.id === photo.id} onClick={() => void changeOrder(photo, -1)} aria-label={`Mover ${photo.label} para antes`}>↑</button>
                  <button disabled={busy || photosBySlot[photo.slotId]?.at(-1)?.id === photo.id} onClick={() => void changeOrder(photo, 1)} aria-label={`Mover ${photo.label} para depois`}>↓</button>
                </>}
                <button data-action="remove" disabled={busy} onClick={() => void runAction(() => removePhoto(reportId, photo.id))}>Remover</button>
              </>}
            />
          </div>

          {/* Slots à direita */}
          <div>
            <SlotList
              slots={slots}
              photosBySlot={photosBySlot}
              onCrop={(id) => void openCrop(id)}
              onClickAllocate={onClickAllocate}
            />

            <button
              onClick={() => void onAdvance()}
              disabled={!canAdvance || advancing || uploading || busy}
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
  renderActions,
}: {
  photos: UIPhoto[];
  picked: string | null;
  onPick: (id: string) => void;
  renderActions: (photo: UIPhoto) => ReactNode;
}) {
  return (
    <div
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as HTMLElement;
        if (target.tagName === 'BUTTON') return;
        const id = target.closest('[data-photo-id]')?.getAttribute('data-photo-id');
        if (id && photos.some(photo => photo.id === id && photo.status === 'done')) {
          event.preventDefault(); onPick(id);
        }
      }}
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest('[data-photo-id]');
        const id = el?.getAttribute('data-photo-id');
        const p = photos.find((x) => x.id === id);
        if (id && p && p.status === 'done') onPick(id);
      }}
    >
      <Gallery photos={photos} picked={picked} renderActions={renderActions} />
    </div>
  );
}
