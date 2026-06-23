'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * NodeView do `leaderLine` (linha "Rótulo …… Valor" do Contents/Figures).
 * Atom não editável; espelha o render de impressão (PrintDocument).
 */
export function LeaderLineView({ node }: NodeViewProps) {
  const label = (node.attrs.label as string) ?? '';
  const value = (node.attrs.value as string) ?? '';
  return (
    <NodeViewWrapper className="ed-leader" contentEditable={false}>
      <span className="ed-leader__label">{label}</span>
      <span className="ed-leader__dots" />
      <span className="ed-leader__value">{value}</span>
    </NodeViewWrapper>
  );
}
