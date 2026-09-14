'use client';

import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { UIPhoto } from './types';
import { PhotoImage } from './PhotoImage';

interface GalleryProps {
  photos: UIPhoto[];
  picked?: string | null;
  renderActions?: (photo: UIPhoto) => ReactNode;
}

function GalleryItem({ photo, selected, actions }: { photo: UIPhoto; selected: boolean; actions: ReactNode }) {
  const draggable = photo.status === 'done';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `photo:${photo.id}`, data: { photoId: photo.id }, disabled: !draggable,
  });
  const analyzing = photo.aiStatus === 'pending' || photo.aiStatus === 'running';
  const message = photo.status === 'error' ? photo.errorMessage || 'Falha no processamento.'
    : photo.aiStatus === 'error' ? photo.aiError || 'Falha na análise da IA.' : null;
  return (
    <article data-photo-id={photo.id} style={{ minWidth: 0, border: selected ? '2px solid #16294d' : '1px solid #e4e0d8', borderRadius: 10, overflow: 'hidden', background: '#fff', opacity: isDragging ? 0.4 : 1, boxShadow: selected ? '0 0 0 2px #e7ecf4' : 'none' }}>
      <div ref={setNodeRef} {...(draggable ? listeners : {})} {...attributes}
        aria-label={`Selecionar ${photo.label}`} title={photo.label}
        style={{ position: 'relative', aspectRatio: '4 / 3', background: '#f4f2ee', cursor: draggable ? 'grab' : 'default' }}>
        {photo.thumbUrl ? <PhotoImage src={photo.thumbUrl} label={photo.label} />
          : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12, color: '#7d7468' }}>
            {photo.status === 'pending' ? 'Processando…' : 'Imagem indisponível'}
          </div>}
        {photo.slotId && <span style={{ position: 'absolute', top: 8, right: 8, background: '#2f7d52', color: '#fff', borderRadius: 99, padding: '2px 6px', fontSize: 11 }}>✓</span>}
        {(analyzing || photo.aiSuggested) && <span style={{ position: 'absolute', left: 8, top: 8, background: '#16294d', color: '#fff', borderRadius: 5, padding: '3px 6px', fontSize: 10 }}>
          {photo.aiSuggested ? 'Sugestão IA' : photo.aiStatus === 'running' ? 'IA analisando…' : 'IA aguardando…'}
        </span>}
      </div>
      <div style={{ padding: '9px 10px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#7d7468', marginBottom: 7 }}>{photo.label}</div>
        {message && <div role="status" style={{ color: '#9b2a2c', fontSize: 11, marginBottom: 8, overflowWrap: 'anywhere' }}>{message}</div>}
        <div className="photo-card-actions" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>{actions}</div>
      </div>
    </article>
  );
}

export function Gallery({ photos, picked, renderActions }: GalleryProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Galeria</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#9a9185' }}>{photos.length} fotos · {photos.filter(photo => photo.slotId !== null).length} alocadas</div>
      </div>
      {!photos.length ? <div style={{ border: '2px dashed #c9c3b6', borderRadius: 10, padding: '34px 16px', textAlign: 'center', fontSize: 13, color: '#7d7468' }}>Nenhuma foto enviada ainda.</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {photos.map(photo => <GalleryItem key={photo.id} photo={photo} selected={picked === photo.id} actions={renderActions?.(photo)} />)}
        </div>}
    </div>
  );
}
