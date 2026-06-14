/**
 * PrintDocument — implementação 004/T-004.
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
} from '@naabsa/core';

// ── Tipos locais ────────────────────────────────────────────────────────────

interface PrintDocumentProps {
  /** JSON TipTap gerado pelo document-builder. */
  document: TipTapDoc;
  /** Metadados exibidos no cabeçalho (para acessibilidade e impressão). */
  vesselName?: string;
}

// ── Componente raiz ─────────────────────────────────────────────────────────

export function PrintDocument({ document: tipDoc, vesselName }: PrintDocumentProps) {
  return (
    <article
      className="print-document"
      aria-label={vesselName ? `Relatório — ${vesselName}` : 'Relatório'}
    >
      {tipDoc.content.map((node, i) => (
        <BlockNode key={i} node={node} />
      ))}
    </article>
  );
}

// ── Render de block node ────────────────────────────────────────────────────

function BlockNode({ node }: { node: TipTapNode }) {
  switch (node.type) {
    case 'paragraph':
      return (
        <p>
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
        <Tag>
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

    default:
      return null;
  }
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
  // marks padrão que podemos encontrar num doc TipTap
  if (mark.type === 'bold') return <strong>{children}</strong>;
  if (mark.type === 'italic') return <em>{children}</em>;
  if (mark.type === 'underline') return <u>{children}</u>;
  return children;
}

// ── Nodes custom ────────────────────────────────────────────────────────────

function PhotoFrame({ node }: { node: PhotoFrameNode }) {
  const {
    src = null,
    widthMm = 150,
    heightMm = 112,
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
  const { headers, rows = [] } = node.attrs ?? ({} as DataTableNode['attrs']);
  return (
    <table className="print-data-table">
      {headers && headers.length > 0 && (
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
