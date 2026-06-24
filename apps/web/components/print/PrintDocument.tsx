/**
 * PrintDocument — 004/T-004, layout real em T-013.
 *
 * Render do document_json (TipTap) para impressão A4.
 * Compartilhado entre a rota /print (usada pelo worker) e o preview da
 * implementação 008 (editor). O princípio nº 5 (preview = PDF) é garantido
 * pelo uso do mesmo componente nos dois contextos.
 *
 * Nodes suportados:
 *  - Padrão TipTap: doc, paragraph, heading, text, hardBreak
 *  - Custom: photoFrame, dataTable (atoms)
 * Marks suportadas:
 *  - Custom: dataField (renderiza valor com fonte mono)
 */

import './print.css';
import type {
  TipTapDoc,
  TipTapNode,
  TipTapMark,
  PhotoFrameNode,
  DataTableNode,
  SheetImageNode,
} from '@naabsa/core';

// ── Tipos locais ────────────────────────────────────────────────────────────

interface PrintDocumentProps {
  /** JSON TipTap gerado pelo document-builder. */
  document: TipTapDoc;
  /** Nome do navio — usado no aria-label e para acessibilidade. */
  vesselName?: string;
  /**
   * Renderiza o cabeçalho NAABSA no fluxo do documento. `true` no preview do
   * operador (navegador, sem chrome por página). `false` no worker, onde o
   * Playwright injeta o cabeçalho/rodapé em TODAS as páginas (headerTemplate).
   */
  showInFlowHeader?: boolean;
}

// ── Componente raiz ─────────────────────────────────────────────────────────

export function PrintDocument({
  document: tipDoc,
  vesselName,
  showInFlowHeader = true,
}: PrintDocumentProps) {
  const photoSrcs = collectPhotoSrcs(tipDoc);
  return (
    <>
      {photoSrcs.map((src, i) => (
        <link key={i} rel="preload" as="image" href={src} />
      ))}
      {showInFlowHeader && <NaabsaHeader />}
      <CoverAddress />
      <article
        className="print-document"
        aria-label={vesselName ? `Relatório — ${vesselName}` : 'Relatório'}
      >
        {tipDoc.content.map((node, i) => (
          <BlockNode key={i} node={node} />
        ))}
      </article>
    </>
  );
}

// ── Cabeçalho institucional (logo + tagline, como o Word) ────────────────────

function NaabsaHeader() {
  return (
    <header className="print-naabsa-header">
      {/* Logo real extraído do modelo do cliente (word/media/image4.jpg). */}
      <img className="print-naabsa-logo" src="/naabsa-logo.jpg" alt="NAABSA" />
      <div className="print-naabsa-tag">
        <div className="print-naabsa-tag-main">MARINE SURVEYORS &amp; CONSULTANTS</div>
        <div className="print-naabsa-tag-sub">Main Brazilian Ports</div>
      </div>
    </header>
  );
}

// ── Bloco de endereço da capa (duas colunas, centralizado) ───────────────────

function CoverAddress() {
  return (
    <div className="print-cover-address">
      <div>
        433 Ana Costa Avenue
        <br />
        Suite 184 - Santos / Brazil
        <br />
        11060-003
      </div>
      <div>
        Telephone: +55 13 33940655
        <br />
        email: surveyors@naabsa.com
        <br />
        www.naabsa.com
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectPhotoSrcs(doc: TipTapDoc): string[] {
  const srcs: string[] = [];
  for (const node of doc.content) {
    if (node.type === 'photoFrame') {
      const src = (node as PhotoFrameNode).attrs?.src;
      if (src) srcs.push(src);
    }
  }
  return srcs;
}

// ── Render de block node ────────────────────────────────────────────────────

function BlockNode({ node }: { node: TipTapNode }) {
  const align = node.attrs?.textAlign as string | undefined;
  const alignStyle: React.CSSProperties | undefined =
    align && align !== 'left' ? { textAlign: align as 'center' | 'right' | 'justify' } : undefined;

  switch (node.type) {
    case 'paragraph':
      return (
        <p style={alignStyle}>
          {node.content?.map((child, i) => <InlineNode key={i} node={child} />) ?? null}
        </p>
      );

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const Tag = `h${Math.min(Math.max(level, 1), 6)}` as
        | 'h1'
        | 'h2'
        | 'h3'
        | 'h4'
        | 'h5'
        | 'h6';
      return (
        <Tag style={alignStyle} data-anchor={(node.attrs?.anchor as string | undefined) || undefined}>
          {node.content?.map((child, i) => <InlineNode key={i} node={child} />) ?? null}
        </Tag>
      );
    }

    case 'hardBreak':
      return <br />;

    case 'photoFrame':
      return <PhotoFrame node={node as PhotoFrameNode} />;

    case 'dataTable':
      return <DataTable node={node as DataTableNode} />;

    case 'leaderLine':
      return <LeaderLine node={node} />;

    case 'sheetImage':
      return <SheetImage node={node as SheetImageNode} />;

    default:
      return null;
  }
}

// ── sheetImage (print pixel-perfeito da aba da planilha) ─────────────────────

function SheetImage({ node }: { node: SheetImageNode }) {
  const { src = null, alt = '' } = node.attrs ?? ({} as SheetImageNode['attrs']);
  if (!src) {
    return (
      <div className="print-sheet-image print-sheet-image--missing">
        Print da planilha não disponível
      </div>
    );
  }
  return <img className="print-sheet-image" src={src} alt={alt} />;
}

// ── leaderLine (Rótulo …… Valor) ────────────────────────────────────────────

function LeaderLine({ node }: { node: TipTapNode }) {
  const label = (node.attrs?.label as string) ?? '';
  const value = (node.attrs?.value as string) ?? '';
  const tocTarget = (node.attrs?.tocTarget as string | null) ?? null;
  return (
    <div className="print-leader" data-toc={tocTarget || undefined}>
      <span className="print-leader__label">{label}</span>
      <span className="print-leader__dots" aria-hidden="true" />
      <span className="print-leader__value">{value}</span>
    </div>
  );
}

// ── Render de inline node ───────────────────────────────────────────────────

function InlineNode({ node }: { node: TipTapNode }) {
  if (node.type === 'hardBreak') return <br />;
  if (node.type !== 'text') return null;

  const raw = node.text ?? '';

  if (!node.marks || node.marks.length === 0) {
    return <>{raw}</>;
  }

  let content: React.ReactNode = raw;

  for (const mark of node.marks) {
    content = applyMark(mark, content);
  }

  return <>{content}</>;
}

function applyMark(mark: TipTapMark, children: React.ReactNode): React.ReactNode {
  if (mark.type === 'dataField') {
    return <span className="print-data-field">{children}</span>;
  }
  if (mark.type === 'bold') return <strong>{children}</strong>;
  if (mark.type === 'italic') return <em>{children}</em>;
  if (mark.type === 'underline') return <u>{children}</u>;
  return children;
}

// ── Nodes custom ────────────────────────────────────────────────────────────

function PhotoFrame({ node }: { node: PhotoFrameNode }) {
  const {
    src = null,
    widthMm = 130,
    heightMm = 97,
    slotId = '',
  } = node.attrs ?? ({} as PhotoFrameNode['attrs']);

  const style: React.CSSProperties = {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
  };

  if (!src) {
    return (
      <div
        className="print-photo-frame print-photo-placeholder"
        style={style}
        aria-label={`Foto do slot ${slotId} (não alocada)`}
      >
        Foto não disponível
      </div>
    );
  }

  return (
    <div className="print-photo-frame" style={style}>
      <img
        src={src}
        alt={`Foto do slot ${slotId}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function DataTable({ node }: { node: DataTableNode }) {
  const { headers, rows = [], kind } = node.attrs ?? ({} as DataTableNode['attrs']);
  const hasHeaders = headers && headers.length > 0;
  // `kind` explícito do builder; fallback por heurística (compat. docs antigos).
  const isLabel = kind === 'label' || (!kind && !hasHeaders && rows.length > 0 && rows.every((r) => r.length === 2));
  const isGrid = kind === 'grid' || (!kind && !hasHeaders && !isLabel);
  const modifier = isLabel ? ' print-data-table--label' : isGrid ? ' print-data-table--grid' : '';
  return (
    <table className={`print-data-table${modifier}`}>
      {hasHeaders && (
        <thead>
          <tr>
            {headers.map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
