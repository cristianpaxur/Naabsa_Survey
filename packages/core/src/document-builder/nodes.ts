/**
 * Construtores JSON dos nodes custom do TipTap (PRD §9, 004/T-001).
 *
 * Todos os nodes são serializáveis (sem funções, sem referências circulares)
 * e ficam em packages/core (TS puro — sem React, sem DOM).
 */

// ── Primitivas TipTap ────────────────────────────────────────────────────────

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

// ── Marks custom ─────────────────────────────────────────────────────────────

/** Mark inline que vincula um trecho de texto a um campo do spec. */
export interface DataFieldMark extends TipTapMark {
  type: 'dataField';
  attrs: { field: string };
}

// ── Nodes custom ─────────────────────────────────────────────────────────────

/** Frame de foto — atom, não selecionável/arrastável pelo usuário. */
export interface PhotoFrameNode extends TipTapNode {
  type: 'photoFrame';
  attrs: {
    slotId: string;
    photoId: string | null;
    src: string | null;
    widthMm: number;
    heightMm: number;
  };
}

/** Linha de uma dataTable: array de strings (já formatados). */
export type TableRow = string[];

/** Tabela de dados — atom, não editável. */
export interface DataTableNode extends TipTapNode {
  type: 'dataTable';
  attrs: {
    tableId: string;
    /** Cabeçalhos opcionais; se presentes, são a primeira linha visual. */
    headers?: string[];
    rows: TableRow[];
    /** Estilo de render: tabela com cabeçalho (data), label:valor (label) ou grade Excel (grid). */
    kind?: 'data' | 'label' | 'grid';
  };
}

/**
 * Linha com líder pontilhado "Rótulo ......... Valor" (atom), como o sumário e
 * o bloco de Figures do Word. `tocTarget` liga a entrada do Contents à âncora da
 * seção (o worker preenche o número da página no PDF).
 */
export interface LeaderLineNode extends TipTapNode {
  type: 'leaderLine';
  attrs: { label: string; value: string; tocTarget: string | null };
}

/**
 * Imagem de largura total (atom) — o "print da planilha" (aba do Excel
 * renderizada via LibreOffice). `src` guarda o CAMINHO de Storage; a rota
 * /print assina no render (como o photoFrame).
 */
export interface SheetImageNode extends TipTapNode {
  type: 'sheetImage';
  attrs: { src: string | null; alt: string };
}

// ── Construtores ─────────────────────────────────────────────────────────────

/** Constói a mark `dataField` que vincula texto a um campo do spec. */
export function dataField(field: string): DataFieldMark {
  return { type: 'dataField', attrs: { field } };
}

/** Constrói um node `photoFrame`. */
export function photoFrame(attrs: PhotoFrameNode['attrs']): PhotoFrameNode {
  return { type: 'photoFrame', attrs };
}

/** Constrói um node `dataTable`. */
export function dataTable(attrs: DataTableNode['attrs']): DataTableNode {
  return { type: 'dataTable', attrs };
}

/** Constrói uma `leaderLine` (rótulo … valor). */
export function leaderLine(attrs: {
  label: string;
  value?: string;
  tocTarget?: string | null;
}): LeaderLineNode {
  return {
    type: 'leaderLine',
    attrs: { label: attrs.label, value: attrs.value ?? '', tocTarget: attrs.tocTarget ?? null },
  };
}

/** Constrói um node `sheetImage` (print da aba da planilha). */
export function sheetImage(attrs: { src: string | null; alt?: string }): SheetImageNode {
  return { type: 'sheetImage', attrs: { src: attrs.src, alt: attrs.alt ?? '' } };
}

// ── Helpers de texto ─────────────────────────────────────────────────────────

/** Nó de texto simples. */
export function text(
  value: string,
  marks?: TipTapMark[],
): TipTapNode {
  const node: TipTapNode = { type: 'text', text: value };
  if (marks && marks.length > 0) node.marks = marks;
  return node;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Parágrafo contendo nodes inline. `align` → attr `textAlign`; `anchor` → attr
 * `anchor` (alvo do Contents, preservado pelo atributo global do editor). */
export function paragraph(
  content: TipTapNode[] = [],
  align?: TextAlign,
  anchor?: string,
): TipTapNode {
  const attrs: Record<string, unknown> = {};
  if (align) attrs.textAlign = align;
  if (anchor) attrs.anchor = anchor;
  const node: TipTapNode = { type: 'paragraph', content };
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  return node;
}

/** Heading (nível 1–6), com alinhamento e âncora (alvo do Contents) opcionais. */
export function heading(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: TipTapNode[],
  align?: TextAlign,
  anchor?: string,
): TipTapNode {
  const attrs: Record<string, unknown> = { level };
  if (align) attrs.textAlign = align;
  if (anchor) attrs.anchor = anchor;
  return { type: 'heading', attrs, content };
}

/** Monta o documento raiz a partir de um array de nodes de bloco. */
export function doc(content: TipTapNode[]): TipTapDoc {
  return { type: 'doc', content };
}
