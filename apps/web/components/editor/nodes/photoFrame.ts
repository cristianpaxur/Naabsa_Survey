import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PhotoFrameView } from './PhotoFrameView';

/**
 * Node custom `photoFrame` (008/T-001, PRD §9 / RF-22).
 *
 * Atom de bloco TRAVADO: `selectable:false`, `draggable:false`, `atom:true`.
 * Atributos `{slotId, photoId, src, widthMm, heightMm, aspect}` — espelham o
 * builder da 004 (mais `aspect`, usado só na afford­ance do editor).
 *
 * O travamento contra deleção/edição é reforçado pelo lockGuard
 * (filterTransaction). Aqui garantimos que o ProseMirror trate o nó como
 * indivisível e não-selecionável por interação.
 */
export const PhotoFrame = Node.create({
  name: 'photoFrame',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      slotId: { default: '' },
      photoId: { default: null },
      src: { default: null },
      widthMm: { default: 150 },
      heightMm: { default: 112 },
      aspect: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="photo-frame"]' }];
  },

  renderHTML() {
    // Serialização HTML mínima (o render real é o NodeView).
    return ['div', { 'data-type': 'photo-frame' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PhotoFrameView);
  },
});
