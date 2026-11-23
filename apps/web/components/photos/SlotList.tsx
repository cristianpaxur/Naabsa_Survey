'use client';

import { PhotoImage } from './PhotoImage';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PhotoDropTarget, PhotoSlot, UIPhoto } from './types';

/** Cor do contador have/max: verde se há fotos, neutro se vazio (fotos opcionais). */
function counterColor(have: number): string {
  return have > 0 ? '#2f7d52' : '#7d7468';
}

/** Miniatura alocada (clicável para abrir o crop). */
function AllocatedThumb({
  slotId,
  photo,
  index,
  count,
  canSort,
  onCrop,
  onUnallocate,
  onRemove,
  onReorder,
  busy,
}: {
  slotId: string;
  photo: UIPhoto;
  index: number;
  count: number;
  canSort: boolean;
  onCrop: (photoId: string) => void;
  onUnallocate: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  onReorder: (photo: UIPhoto, index: number) => void;
  busy: boolean;
}) {
  const draggable = !busy && photo.status === 'done';
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id: `photo:${photo.id}`,
    data: {
      kind: 'position',
      slotId,
      photoId: photo.id,
    } satisfies PhotoDropTarget,
    disabled: { draggable: !draggable, droppable: !canSort },
    attributes: { roleDescription: 'foto arrastável' },
  });

  return (
    <div
      ref={setNodeRef}
      className="photo-allocated-thumb"
      data-photo-id={photo.id}
      data-drag-source={isDragging || undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="photo-allocated-image"
        data-draggable={draggable || undefined}
        type="button"
        disabled={busy}
        onClick={() => onCrop(photo.id)}
        title="Recortar"
        aria-label={`Recortar ${photo.label}`}
      >
        {photo.thumbUrl && (
          <PhotoImage
            src={photo.thumbUrl}
            label={photo.label}
            retryable={false}
          />
        )}
        {photo.status === 'done' && (
          <span className="photo-drag-grip" aria-hidden />
        )}
      </button>
      <div
        style={{
          position: 'absolute',
          top: 5,
          left: 5,
          display: 'flex',
          gap: 4,
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => onUnallocate(photo.id)}
          title="Desalocar foto"
          style={thumbActionStyle}
        >
          Desalocar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(photo.id)}
          title="Remover foto definitivamente"
          style={{ ...thumbActionStyle, background: '#a22b2b' }}
        >
          Remover
        </button>
      </div>
      {count > 1 && (
        <select
          className="photo-order-select"
          aria-label={`Posição de ${photo.label}`}
          disabled={busy}
          value={index}
          onChange={(event) => onReorder(photo, Number(event.target.value))}
        >
          {Array.from({ length: count }, (_, position) => (
            <option key={position} value={position}>
              Posição {position + 1}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const thumbActionStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  padding: '3px 5px',
  background: '#16294d',
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  cursor: 'pointer',
};

interface SlotRowProps {
  slot: PhotoSlot;
  photos: UIPhoto[];
  draggedPhoto: UIPhoto | null;
  onCrop: (photoId: string) => void;
  onClickAllocate: (slotId: string) => void;
  onUnallocate: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  onReorder: (photo: UIPhoto, index: number) => void;
  busy: boolean;
}

function SlotRow({
  slot,
  photos,
  draggedPhoto,
  onCrop,
  onClickAllocate,
  onUnallocate,
  onRemove,
  onReorder,
  busy,
}: SlotRowProps) {
  const have = photos.length;
  const max = slot.max ?? '∞';
  const color = counterColor(have);
  const slotFull = typeof slot.max === 'number' && have >= slot.max;
  const movingHere = draggedPhoto !== null && draggedPhoto.slotId !== slot.id;
  const canSort = !busy && draggedPhoto?.slotId === slot.id;
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${slot.id}`,
    data: { kind: 'slot', slotId: slot.id } satisfies PhotoDropTarget,
    disabled: busy || !movingHere || slotFull,
  });

  return (
    <div
      ref={setNodeRef}
      className="photo-slot-row"
      data-slot-id={slot.id}
      data-photo-drop-area
      data-drop-state={
        isOver
          ? 'over'
          : movingHere
            ? slotFull
              ? 'blocked'
              : 'available'
            : undefined
      }
      style={{
        padding: 14,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
      }}
    >
      <div className="photo-slot-images" style={{ flex: '1 1 100%', order: 1 }}>
        <SortableContext
          items={photos.map((p) => `photo:${p.id}`)}
          strategy={rectSortingStrategy}
        >
          {photos.map((p, index) => (
            <AllocatedThumb
              key={p.id}
              slotId={slot.id}
              photo={p}
              index={index}
              count={have}
              canSort={canSort}
              onCrop={onCrop}
              onUnallocate={onUnallocate}
              onRemove={onRemove}
              onReorder={onReorder}
              busy={busy}
            />
          ))}
        </SortableContext>
        {!slotFull && (
          <button
            type="button"
            className="photo-slot-allocate"
            disabled={busy}
            onClick={() => onClickAllocate(slot.id)}
          >
            <span aria-hidden>＋</span>
            {isOver ? 'Solte aqui' : 'Alocar'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>{slot.label}</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: '#27406e',
              background: '#eef1f7',
              padding: '2px 7px',
              borderRadius: 5,
            }}
          >
            {slot.aspect}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--rocha)',
              background: '#f4f2ef',
              border: '1px solid #e6e1d8',
              padding: '2px 7px',
              borderRadius: 99,
            }}
          >
            opcional
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--rocha)',
          }}
        >
          {slot.id}
        </div>
      </div>

      <div style={{ flex: 'none', textAlign: 'right' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
            }}
          />
          {have}/{max}
        </div>
      </div>
    </div>
  );
}

export interface SlotListProps {
  slots: PhotoSlot[];
  /** Fotos alocadas por slot, já ordenadas por position. */
  photosBySlot: Record<string, UIPhoto[]>;
  draggedPhoto: UIPhoto | null;
  savingPlacement: boolean;
  onCrop: (photoId: string) => void;
  onClickAllocate: (slotId: string) => void;
  onUnallocate: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  onReorder: (photo: UIPhoto, index: number) => void;
  busy: boolean;
}

/**
 * Lista de slots do spec (RF-17): label, chip de aspect, badge "opcional",
 * id mono, contador have/max e dropzone "Alocar". Fotos nunca são obrigatórias.
 */
export function SlotList({
  slots,
  photosBySlot,
  draggedPhoto,
  savingPlacement,
  onCrop,
  onClickAllocate,
  onUnallocate,
  onRemove,
  onReorder,
  busy,
}: SlotListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>Slots do relatório</div>
        <div
          role="status"
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--rocha)' }}
        >
          {savingPlacement ? 'Salvando posição…' : 'Fotos opcionais'}
        </div>
      </div>

      {slots.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--rocha)' }}>
          Este tipo de relatório não define slots de foto.
        </div>
      )}

      {slots.map((slot) => (
        <SlotRow
          key={slot.id}
          slot={slot}
          photos={photosBySlot[slot.id] ?? []}
          draggedPhoto={draggedPhoto}
          onCrop={onCrop}
          onClickAllocate={onClickAllocate}
          onUnallocate={onUnallocate}
          onRemove={onRemove}
          onReorder={onReorder}
          busy={busy}
        />
      ))}
    </div>
  );
}
