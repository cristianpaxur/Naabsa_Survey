import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReportProgress } from './ReportProgress';

vi.stubGlobal('React', { createElement });

describe('ReportProgress', () => {
  it('renderiza um trilho uniforme com uma célula por etapa', () => {
    const nav = ReportProgress({ current: 'pdf' }) as unknown as {
      props: { className: string; children: { props: { className: string; children: unknown } } };
    };
    const list = nav.props.children;
    const items = list.props.children as Array<{ props: { className: string } }>;

    expect(nav.props.className).toBe('report-progress');
    expect(list.props.className).toBe('report-progress__list');
    expect(items).toHaveLength(6);
    expect(items.every((item) => item.props.className === 'report-progress__item')).toBe(true);
  });
});
