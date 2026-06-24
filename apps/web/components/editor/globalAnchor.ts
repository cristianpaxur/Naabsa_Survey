import { Extension } from '@tiptap/core';

/**
 * Adiciona o atributo `anchor` aos nodes `heading` e `paragraph` para que os
 * alvos do Contents (data-anchor) SOBREVIVAM ao round-trip do editor — o worker
 * usa esses ancoras para preencher os números de página no PDF.
 */
export const GlobalAnchor = Extension.create({
  name: 'globalAnchor',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          anchor: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-anchor'),
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.anchor ? { 'data-anchor': attrs.anchor as string } : {},
          },
        },
      },
    ];
  },
});
