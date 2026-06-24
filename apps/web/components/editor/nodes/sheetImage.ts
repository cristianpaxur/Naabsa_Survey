import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SheetImageView } from './SheetImageView';

/**
 * Node custom `sheetImage` — print da aba da planilha (largura total). Atom de
 * bloco travado (lockGuard). Espelha o construtor da 004.
 */
export const SheetImage = Node.create({
  name: 'sheetImage',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="sheet-image"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'sheet-image' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SheetImageView);
  },
});
