'use client';

import { useDroppable } from '@dnd-kit/core';
import type { PhotoSlot, UIPhoto } from './types';

/** Cor do contador have/max: verde se há fotos, neutro se vazio (fotos opcionais). */
function counterColor(have: number): string {
  return have > 0 ? '#2f7d52' : '#7d7468';
}

/** Miniatura alocada (clicável para abrir o crop). */
function AllocatedThumb({
  photo,
  onCrop,
}: {
  photo: UIPhoto;
  onCrop: (photoId: string) => void;
}) {
  return (
    <button
      onClick={() => onCrop(photo.id)}
      title="Recortar"
      style={{
        position: 'relative',
        width: 120,
        aspectRatio: '4 / 3',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#2b3647',
        flex: 'none',
        cursor: 'pointer',
        border: 'none',
        padding: 0,
      }}
    >
      {photo.thumbUrl && (
        <img
          src={photo.thumbUrl}
          alt={photo.label}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
      )}
      <span
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'rgba(255,255,255,.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            border: '1.5px solid #16294d',
            borderRadius: 2,
          }}
        />
      </span>
    </button>
  );
}

/** Dropzone tracejada "Alocar" — também alvo do drop e do clique fallback. */
function AllocateDropzone({
  slotId,
  onClickAllocate,
}: {
  slotId: string;
  onClickAllocate: (slotId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${slotId}`,
    data: { slotId },
  });
  return (
    <div
      ref={setNodeRef}
      onClick={() => onClickAllocate(slotId)}
      role="button"
      tabIndex={0}
      style={{
        width: 120,
        aspectRatio: '4 / 3',
        borderRadius: 8,
        border: `2px dashed ${isOver ? '#16294d' : '#c9c3b6'}`,
        background: isOver ? '#f4f6fb' : '#faf8f5',
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 18, color: '#9a9185', lineHeight: 1 }}>＋</span>
      <span style={{ fontSize: 10.5, color: '#9a9185', fontWeight: 600 }}>
        Alocar
      </span>
    </div>
  );
}

interface SlotRowProps {
  slot: PhotoSlot;
  photos: UIPhoto[];
  onCrop: (photoId: string) => void;
  onClickAllocate: (slotId: string) => void;
}

function SlotRow({ slot, photos, onCrop, onClickAllocate }: SlotRowProps) {
  const have = photos.length;
  const max = slot.max ?? '∞';
  const color = counterColor(have);
  const slotFull = typeof slot.max === 'number' && have >= slot.max;

  return (
    <div
      style={{
        border: '1px solid #ece8e1',
        borderRadius: 12,
        background: '#fff',
        padding: 14,
        display: 'flex',
        gap: 14,
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 'none' }}
      >
        {photos.map((p) => (
          <AllocatedThumb key={p.id} photo={p} onCrop={onCrop} />
        ))}
        {!slotFull && (
          <AllocateDropzone
            slotId={slot.id}
            onClickAllocate={onClickAllocate}
          />
        )}
      </div>

      <div style={{ flex: 1 }}>
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
  onCrop: (photoId: string) => void;
  onClickAllocate: (slotId: string) => void;
}

/**
 * Lista de slots do spec (RF-17): label, chip de aspect, badge "opcional",
 * id mono, contador have/max e dropzone "Alocar". Fotos nunca são obrigatórias.
 */
export function SlotList({
  slots,
  photosBySlot,
  onCrop,
  onClickAllocate,
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
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rocha)' }}>
          Fotos opcionais
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
          onCrop={onCrop}
          onClickAllocate={onClickAllocate}
        />
      ))}
    </div>
  );
}
