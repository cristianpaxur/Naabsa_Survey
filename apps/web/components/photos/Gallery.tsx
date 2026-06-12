'use client';

import { useDraggable } from '@dnd-kit/core';
import type { UIPhoto } from './types';

/** Item arrastável da galeria (uma foto). */
function GalleryItem({ photo }: { photo: UIPhoto }) {
  const allocated = photo.slotId !== null;
  const draggable = photo.status === 'done';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `photo:${photo.id}`,
    data: { photoId: photo.id },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      data-photo-id={photo.id}
      {...(draggable ? listeners : {})}
      {...attributes}
      title={
        photo.status === 'error'
          ? (photo.errorMessage ?? 'Erro no processamento')
          : photo.label
      }
      style={{
        position: 'relative',
        borderRadius: 9,
        overflow: 'hidden',
        aspectRatio: '4 / 3',
        background: photo.thumbUrl ? '#2b3647' : '#e7e2d9',
        border: '1px solid rgba(0,0,0,.08)',
        cursor: draggable ? 'grab' : 'default',
        opacity: isDragging ? 0.4 : 1,
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

      {/* Estado processando */}
      {photo.status === 'pending' && (
        <div style={overlayCenter}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#7d7468' }}>
            Processando…
          </span>
        </div>
      )}

      {/* Estado erro */}
      {photo.status === 'error' && (
        <div style={{ ...overlayCenter, background: '#fbeceb' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9b2a2c' }}>
            Erro
          </span>
        </div>
      )}

      {/* Nome mono */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 7,
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: photo.thumbUrl ? 'rgba(255,255,255,.9)' : '#7d7468',
        }}
      >
        {photo.label}
      </div>

      {/* Check verde de alocada */}
      {allocated && photo.status === 'done' && (
        <div
          style={{
            position: 'absolute',
            right: 7,
            top: 7,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#2f7d52',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
          }}
        >
          ✓
        </div>
      )}

      {/* Forward-compatible: marca de sugestão de IA (lógica na 010) */}
      {photo.aiSuggested && (
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 7,
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            background: 'var(--navy)',
            padding: '1px 6px',
            borderRadius: 99,
          }}
        >
          IA
        </div>
      )}
    </div>
  );
}

const overlayCenter = {
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(250,248,245,.82)',
};

/**
 * Galeria de fotos (RF-17): grid de thumbs com estado (processando/pronta/
 * alocada/erro). Fotos prontas são arrastáveis para os slots (dnd-kit).
 */
export function Gallery({ photos }: { photos: UIPhoto[] }) {
  const allocated = photos.filter((p) => p.slotId !== null).length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>Galeria</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: '#9a9185',
          }}
        >
          {photos.length} fotos · {allocated} alocadas
        </div>
      </div>

      {photos.length === 0 ? (
        <div
          style={{
            border: '2px dashed #c9c3b6',
            borderRadius: 10,
            padding: '34px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--rocha)',
          }}
        >
          Nenhuma foto enviada ainda.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {photos.map((p) => (
            <GalleryItem key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}
