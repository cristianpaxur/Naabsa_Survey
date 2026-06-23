import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DataTableView } from './DataTableView';

/**
 * Node custom `dataTable` (008/T-002, PRD §9 / RF-22).
 *
 * Atom de bloco não editável: atributos `{tableId, headers?, rows}`.
 * Espelha o construtor da 004 (packages/core). Travamento reforçado pelo
 * lockGuard.
 */
export const DataTable = Node.create({
  name: 'dataTable',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      tableId: { default: '' },
      headers: { default: undefined },
      rows: { default: [] },
      kind: { default: undefined },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="data-table"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'data-table' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataTableView);
  },
});
