'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * NodeView do photoFrame (008/T-001). Render no editor com a afford­ance do
 * protótipo (tela 06): outline tracejado, pill "photoFrame" e legenda mono
 * `slotId · aspect · cover`. A imagem usa object-fit: cover e dimensão fixa
 * em mm (princípio nº 4 — a imagem se adapta ao frame, nunca o contrário).
 *
 * O travamento real (não deletável/editável) é garantido pelo lockGuard
 * (filterTransaction). Os atributos `selectable:false, draggable:false` do node
 * são complementares.
 */
export function PhotoFrameView({ node }: NodeViewProps) {
  const slotId = (node.attrs.slotId as string) ?? '';
  const src = (node.attrs.src as string | null) ?? null;
  const aspect = (node.attrs.aspect as string | null) ?? null;
  const widthMm = (node.attrs.widthMm as number) ?? 150;
  const heightMm = (node.attrs.heightMm as number) ?? 112;

  const legend = [slotId, aspect, 'cover'].filter(Boolean).join(' · ');

  return (
    <NodeViewWrapper
      className="ed-photo-frame"
      contentEditable={false}
      data-slot-id={slotId}
    >
      <div className="ed-photo-frame__pill">photoFrame</div>
      <div
        className="ed-photo-frame__canvas"
        style={{
          width: `${widthMm}mm`,
          maxWidth: '100%',
          aspectRatio: `${widthMm} / ${heightMm}`,
        }}
      >
        {src ? (
          <img
            src={src}
            alt={`Foto do slot ${slotId}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div className="ed-photo-frame__placeholder">Foto não alocada</div>
        )}
      </div>
      <div className="ed-photo-frame__legend">{legend}</div>
    </NodeViewWrapper>
  );
}
