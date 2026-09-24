import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewShell } from './PreviewShell';

vi.stubGlobal('React', { createElement });

describe('PreviewShell', () => {
  it('mantém a esteira e o preview dentro de uma coluna com altura disponível', () => {
    const progress = createElement('span', null, 'progress');
    const content = createElement('span', null, 'content');
    const shell = PreviewShell({ progress, children: content }) as unknown as {
      props: { className: string; children: Array<{ props: { className?: string } }> };
    };
    const progressNode = shell.props.children[0];
    const contentNode = shell.props.children[1];
    if (!progressNode || !contentNode) throw new Error('PreviewShell sem os dois blocos esperados.');

    expect(shell.props.className).toBe('ed-preview-shell');
    expect(progressNode.props.className).toBe('ed-preview-shell__progress');
    expect(contentNode.props.className).toBe('ed-preview-shell__content');
  });
});
