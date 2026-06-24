'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * NodeView do `sheetImage` (print da aba da planilha). No editor o `src` é um
 * caminho de Storage (não assinado), então mostramos um placeholder — a imagem
 * real aparece no preview/PDF (rota /print assina o caminho).
 */
export function SheetImageView(_props: NodeViewProps) {
  return (
    <NodeViewWrapper className="ed-sheet-image" contentEditable={false}>
      <div className="ed-sheet-image__ph">📊 Print da planilha (renderizado no preview/PDF)</div>
    </NodeViewWrapper>
  );
}
