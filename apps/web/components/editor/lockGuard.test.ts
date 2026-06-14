import { describe, it, expect } from 'vitest';
import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  lockedNodesPreserved,
  transactionPreservesLocks,
  BYPASS_LOCK_GUARD,
} from './lockGuard.core';

/**
 * Suite adversarial do lockGuard (008/T-010, CA-001 + spec §6.4).
 * Schema mínimo com os mesmos nós travados do editor real.
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
    photoFrame: {
      group: 'block',
      atom: true,
      selectable: false,
      attrs: { slotId: { default: '' }, photoId: { default: null } },
      toDOM: () => ['div', { 'data-type': 'photo-frame' }],
    },
    dataTable: {
      group: 'block',
      atom: true,
      selectable: false,
      attrs: { tableId: { default: '' }, rows: { default: [] } },
      toDOM: () => ['div', { 'data-type': 'data-table' }],
    },
  },
  marks: {},
});

const { paragraph, photoFrame, dataTable } = schema.nodes;

function buildDoc(): PMNode {
  return schema.node('doc', null, [
    paragraph!.create(null, schema.text('Olá')),
    photoFrame!.create({ slotId: 'draft_fwd', photoId: 'p1' }),
    dataTable!.create({ tableId: 'carga', rows: [['a', 'b']] }),
    paragraph!.create(null, schema.text('fim')),
  ]);
}

function emptyDoc(): PMNode {
  return schema.node('doc', null, [paragraph!.create()]);
}

function findNodePos(
  doc: PMNode,
  typeName: string,
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === typeName) {
      found = { from: pos, to: pos + node.nodeSize };
    }
    return found ? false : true;
  });
  return found;
}

describe('lockedNodesPreserved — função pura', () => {
  it('doc idêntico → preservado', () => {
    expect(lockedNodesPreserved(buildDoc(), buildDoc())).toBe(true);
  });

  it('photoFrame removido → NÃO preservado', () => {
    const newDoc = schema.node('doc', null, [
      paragraph!.create(null, schema.text('Olá')),
      dataTable!.create({ tableId: 'carga', rows: [['a', 'b']] }),
      paragraph!.create(null, schema.text('fim')),
    ]);
    expect(lockedNodesPreserved(buildDoc(), newDoc)).toBe(false);
  });

  it('dataTable removido → NÃO preservado', () => {
    const newDoc = schema.node('doc', null, [
      paragraph!.create(null, schema.text('Olá')),
      photoFrame!.create({ slotId: 'draft_fwd', photoId: 'p1' }),
      paragraph!.create(null, schema.text('fim')),
    ]);
    expect(lockedNodesPreserved(buildDoc(), newDoc)).toBe(false);
  });

  it('atributo de nó travado alterado → NÃO preservado', () => {
    const newDoc = schema.node('doc', null, [
      paragraph!.create(null, schema.text('Olá')),
      photoFrame!.create({ slotId: 'draft_fwd', photoId: 'HACKED' }),
      dataTable!.create({ tableId: 'carga', rows: [['a', 'b']] }),
      paragraph!.create(null, schema.text('fim')),
    ]);
    expect(lockedNodesPreserved(buildDoc(), newDoc)).toBe(false);
  });

  it('texto livre editado, travados intactos → preservado', () => {
    const newDoc = schema.node('doc', null, [
      paragraph!.create(null, schema.text('Olá editado')),
      photoFrame!.create({ slotId: 'draft_fwd', photoId: 'p1' }),
      dataTable!.create({ tableId: 'carga', rows: [['a', 'b']] }),
      paragraph!.create(null, schema.text('fim')),
    ]);
    expect(lockedNodesPreserved(buildDoc(), newDoc)).toBe(true);
  });

  it('adição de nós travados (montagem: vazio → cheio) → permitido', () => {
    expect(lockedNodesPreserved(emptyDoc(), buildDoc())).toBe(true);
  });
});

describe('transactionPreservesLocks — transações adversariais', () => {
  function stateOf(doc: PMNode): EditorState {
    return EditorState.create({ schema, doc });
  }

  it('delete direto do photoFrame → bloqueado', () => {
    const state = stateOf(buildDoc());
    const pos = findNodePos(state.doc, 'photoFrame')!;
    const tr = state.tr.delete(pos.from, pos.to);
    expect(transactionPreservesLocks(tr, state)).toBe(false);
  });

  it('delete direto do dataTable → bloqueado', () => {
    const state = stateOf(buildDoc());
    const pos = findNodePos(state.doc, 'dataTable')!;
    const tr = state.tr.delete(pos.from, pos.to);
    expect(transactionPreservesLocks(tr, state)).toBe(false);
  });

  it('select-all + delete → bloqueado (travados sobrevivem)', () => {
    const state = stateOf(buildDoc());
    const tr = state.tr.delete(0, state.doc.content.size);
    expect(transactionPreservesLocks(tr, state)).toBe(false);
  });

  it('replace do photoFrame por parágrafo (paste sobre) → bloqueado', () => {
    const state = stateOf(buildDoc());
    const pos = findNodePos(state.doc, 'photoFrame')!;
    const tr = state.tr.replaceWith(
      pos.from,
      pos.to,
      paragraph!.create(null, schema.text('colado')),
    );
    expect(transactionPreservesLocks(tr, state)).toBe(false);
  });

  it('edição de texto livre → permitido', () => {
    const state = stateOf(buildDoc());
    // Insere texto no primeiro parágrafo (pos 1 está dentro dele).
    const tr = state.tr.insertText(' mais', 4);
    expect(transactionPreservesLocks(tr, state)).toBe(true);
  });

  it('transação sem mudança de doc (seleção) → permitido', () => {
    const state = stateOf(buildDoc());
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 1));
    expect(transactionPreservesLocks(tr, state)).toBe(true);
  });

  it('BYPASS_LOCK_GUARD libera a montagem programática', () => {
    const state = stateOf(buildDoc());
    const pos = findNodePos(state.doc, 'photoFrame')!;
    const tr = state.tr.delete(pos.from, pos.to).setMeta(BYPASS_LOCK_GUARD, true);
    expect(transactionPreservesLocks(tr, state)).toBe(true);
  });
});
