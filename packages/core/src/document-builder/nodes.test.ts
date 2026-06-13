import { describe, it, expect } from 'vitest';
import {
  dataField,
  photoFrame,
  dataTable,
  text,
  paragraph,
  heading,
  doc,
} from './nodes';

describe('dataField mark', () => {
  it('produz o shape correto', () => {
    expect(dataField('vessel_name')).toEqual({
      type: 'dataField',
      attrs: { field: 'vessel_name' },
    });
  });
});

describe('photoFrame node', () => {
  it('produz o shape completo', () => {
    const node = photoFrame({
      slotId: 'draft_fwd',
      photoId: 'abc-123',
      src: 'https://cdn.example.com/photo.jpg',
      widthMm: 80,
      heightMm: 60,
    });
    expect(node.type).toBe('photoFrame');
    expect(node.attrs.slotId).toBe('draft_fwd');
    expect(node.attrs.photoId).toBe('abc-123');
    expect(node.attrs.widthMm).toBe(80);
    expect(node.attrs.heightMm).toBe(60);
  });

  it('aceita photoId e src nulos (slot não preenchido)', () => {
    const node = photoFrame({ slotId: 'opt_bow', photoId: null, src: null, widthMm: 60, heightMm: 45 });
    expect(node.attrs.photoId).toBeNull();
    expect(node.attrs.src).toBeNull();
  });
});

describe('dataTable node', () => {
  it('produz o shape correto com headers', () => {
    const node = dataTable({
      tableId: 'drafts',
      headers: ['Leitura', 'Porto', 'Ré'],
      rows: [
        ['F 6.50 m', 'M 6.60 m', 'A 6.55 m'],
        ['F 6.48 m', 'M 6.58 m', 'A 6.53 m'],
      ],
    });
    expect(node.type).toBe('dataTable');
    expect(node.attrs.tableId).toBe('drafts');
    expect(node.attrs.headers).toHaveLength(3);
    expect(node.attrs.rows).toHaveLength(2);
  });

  it('aceita tabela sem headers', () => {
    const node = dataTable({ tableId: 'simple', rows: [['A', 'B']] });
    expect(node.attrs.headers).toBeUndefined();
  });
});

describe('helpers de texto', () => {
  it('text simples', () => {
    expect(text('Olá')).toEqual({ type: 'text', text: 'Olá' });
  });

  it('text com marks', () => {
    const m = dataField('survey_date');
    const node = text('01/Jun/2026', [m]);
    expect(node.marks).toHaveLength(1);
    expect(node.marks![0]).toEqual(m);
  });

  it('paragraph sem conteúdo', () => {
    expect(paragraph()).toEqual({ type: 'paragraph', content: [] });
  });

  it('heading nível 2', () => {
    const h = heading(2, [text('Seção')]);
    expect(h.type).toBe('heading');
    expect(h.attrs?.level).toBe(2);
    expect(h.content).toHaveLength(1);
  });

  it('doc envolve blocks', () => {
    const d = doc([paragraph([text('oi')])]);
    expect(d.type).toBe('doc');
    expect(d.content).toHaveLength(1);
  });
});
