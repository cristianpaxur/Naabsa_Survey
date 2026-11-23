import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FieldRow } from './FieldRow';

vi.mock('@/lib/actions/review', () => ({ setOverride: vi.fn() }));
vi.stubGlobal('React', { createElement });

describe('horários na revisão de dados', () => {
  it.each(['00:00', null])('renderiza um controle de hora editável para %s', (value) => {
    const html = renderToStaticMarkup(createElement(FieldRow, {
      reportId: 'r1',
      name: 'initial_start',
      def: { type: 'time', label: 'Início — Inicial', cell: 'G7', section: 'Datas' },
      value,
      isOverride: false,
      fieldIssues: [],
      onIssuesUpdated: vi.fn(),
      onSavingChanged: vi.fn(),
    }));
    const input = html.match(/<input\b[^>]*>/)?.[0] ?? '';
    expect(input).toContain('type="time"');
    expect(input).toContain('aria-label="Início — Inicial"');
    expect(input).toContain(`value="${value ?? ''}"`);
    expect(input).not.toContain('disabled');
  });
});
