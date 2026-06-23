import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LeaderLineView } from './LeaderLineView';

/**
 * Node custom `leaderLine` — linha "Rótulo …… Valor" do Contents e do bloco de
 * Figures. Atom de bloco travado (lockGuard). Espelha o construtor da 004.
 */
export const LeaderLine = Node.create({
  name: 'leaderLine',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      label: { default: '' },
      value: { default: '' },
      tocTarget: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="leader-line"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'leader-line' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LeaderLineView);
  },
});
