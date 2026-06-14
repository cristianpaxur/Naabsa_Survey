import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Mark custom `dataField` (008/T-002, PRD §9 / RF-23).
 *
 * Vincula um trecho de texto a um campo do spec (`{field}`). Visualmente:
 * fundo azul claro + sublinhado (tela 06 do protótipo) e highlight no hover.
 * NÃO trava a edição do texto — o operador pode editá-lo livremente (CA-007);
 * a mark apenas marca a origem do valor (planilha).
 */
export const DataField = Mark.create({
  name: 'dataField',

  // Não inclusiva: digitar imediatamente após o valor não estende a mark.
  inclusive() {
    return false;
  },

  addAttributes() {
    return {
      field: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-field') ?? '',
        renderHTML: (attrs) =>
          attrs.field ? { 'data-field': attrs.field as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-field]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'ed-data-field' }),
      0,
    ];
  },
});
