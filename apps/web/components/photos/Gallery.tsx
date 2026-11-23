'use client';

import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { PhotoDropTarget, UIPhoto } from './types';
import { PhotoImage } from './PhotoImage';

interface GalleryProps {
  photos: UIPhoto[];
  picked?: string | null;
  busy: boolean;
  renderActions?: (photo: UIPhoto) => ReactNode;
}

export function GalleryPanel({
  acceptsPhoto,
  children,
}: {
  acceptsPhoto: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop:gallery',
    data: { kind: 'gallery' } satisfies PhotoDropTarget,
    disabled: !acceptsPhoto,
  });

  return (
    <div
      ref={setNodeRef}
      className="photo-gallery-panel"
      data-photo-gallery
      data-photo-drop-area
      data-drop-state={isOver ? 'over' : acceptsPhoto ? 'available' : undefined}
    >
      {children}
    </div>
  );
}

function GalleryItem({
  photo,
  selected,
  busy,
  actions,
}: {
  photo: UIPhoto;
  selected: boolean;
  busy: boolean;
  actions: ReactNode;
}) {
  const draggable = photo.status === 'done' && !busy;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `photo:${photo.id}`,
    data: { photoId: photo.id },
    disabled: !draggable,
    attributes: { roleDescription: 'foto arrastável' },
  });
  const analyzing =
    photo.aiStatus === 'pending' || photo.aiStatus === 'running';
  const message =
    photo.status === 'error'
      ? photo.errorMessage || 'Falha no processamento.'
      : photo.aiStatus === 'error'
        ? photo.aiError || 'Falha na análise da IA.'
        : null;
  return (
    <article
      data-photo-id={photo.id}
      data-drag-source={isDragging || undefined}
      style={{
        minWidth: 0,
        border: selected ? '2px solid #16294d' : '1px solid #e4e0d8',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: selected ? '0 0 0 2px #e7ecf4' : 'none',
      }}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="photo-gallery-image"
        data-draggable={draggable || undefined}
        tabIndex={draggable ? 0 : -1}
        aria-pressed={selected}
        aria-label={`Selecionar ${photo.label}`}
        title={
          draggable
            ? 'Arraste para mover ou clique para selecionar'
            : photo.label
        }
      >
        {photo.thumbUrl ? (
          <PhotoImage src={photo.thumbUrl} label={photo.label} />
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              fontSize: 12,
              color: '#7d7468',
            }}
          >
            {photo.status === 'pending'
              ? 'Processando…'
              : 'Imagem indisponível'}
          </div>
        )}
        {photo.status === 'done' && (
          <span className="photo-drag-grip" aria-hidden />
        )}
        {(analyzing || photo.aiSuggested) && (
          <span
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              background: '#16294d',
              color: '#fff',
              borderRadius: 5,
              padding: '3px 6px',
              fontSize: 10,
            }}
          >
            {photo.aiSuggested
              ? 'Sugestão IA'
              : photo.aiStatus === 'running'
                ? 'IA analisando…'
                : 'IA aguardando…'}
          </span>
        )}
      </div>
      <div style={{ padding: '9px 10px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: '#7d7468',
            marginBottom: 7,
          }}
        >
          {photo.label}
        </div>
        {message && (
          <div
            role="status"
            style={{
              color: '#9b2a2c',
              fontSize: 11,
              marginBottom: 8,
              overflowWrap: 'anywhere',
            }}
          >
            {message}
          </div>
        )}
        <div
          className="photo-card-actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      </div>
    </article>
  );
}

export function Gallery({ photos, picked, busy, renderActions }: GalleryProps) {
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
        <div className="photo-gallery-status">
          <span className="photo-gallery-count">
            {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} para alocar
          </span>
          <span className="photo-gallery-drop-label">
            Solte para devolver à galeria
          </span>
        </div>
      </div>
      {!photos.length ? (
        <div
          style={{
            border: '2px dashed #c9c3b6',
            borderRadius: 10,
            padding: '34px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: '#7d7468',
          }}
        >
          Envie fotos ou arraste uma foto de volta para a galeria.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {photos.map((photo) => (
            <GalleryItem
              key={photo.id}
              photo={photo}
              selected={picked === photo.id}
              busy={busy}
              actions={renderActions?.(photo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
