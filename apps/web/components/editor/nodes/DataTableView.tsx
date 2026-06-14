'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * NodeView do dataTable (008/T-002). Render no editor com a afford­ance do
 * protótipo (tela 06): pill navy "dataTable · travado", cabeçalho azul.
 * Não editável (atom). O conteúdo (headers/rows) vem do builder da 004.
 */
export function DataTableView({ node }: NodeViewProps) {
  const headers = (node.attrs.headers as string[] | undefined) ?? undefined;
  const rows = (node.attrs.rows as string[][] | undefined) ?? [];

  return (
    <NodeViewWrapper className="ed-data-table" contentEditable={false}>
      <div className="ed-data-table__pill">dataTable · travado</div>
      <table className="ed-data-table__grid">
        {headers && headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </NodeViewWrapper>
  );
}
