import { describe, it, expect } from 'vitest';
import {
  REPORT_STATUSES,
  NEXT_STATES,
  isValidTransition,
  type ReportStatus,
} from './state-machine';

describe('máquina de estados (PRD §3.2, CA-003)', () => {
  it('tabela 7×7: válido ⇔ está no grafo', () => {
    for (const from of REPORT_STATUSES) {
      for (const to of REPORT_STATUSES) {
        expect(isValidTransition(from, to)).toBe(
          NEXT_STATES[from].includes(to),
        );
      }
    }
  });

  it('fluxo feliz linear', () => {
    const flow: [ReportStatus, ReportStatus][] = [
      ['draft', 'extracted'],
      ['extracted', 'in_review'],
      ['in_review', 'editing'],
      ['editing', 'approved'],
      ['approved', 'generated'],
      ['generated', 'purged'],
    ];
    for (const [from, to] of flow) {
      expect(isValidTransition(from, to)).toBe(true);
    }
  });

  it('reinício para draft (exceto generated/purged)', () => {
    for (const s of [
      'extracted',
      'in_review',
      'editing',
      'approved',
    ] as ReportStatus[]) {
      expect(isValidTransition(s, 'draft')).toBe(true);
    }
    expect(isValidTransition('generated', 'draft')).toBe(false);
    expect(isValidTransition('purged', 'draft')).toBe(false);
  });

  it('regenerar: generated → editing é válido (010/T-004, RF-30)', () => {
    expect(isValidTransition('generated', 'editing')).toBe(true);
  });

  it('transições inválidas rejeitadas', () => {
    expect(isValidTransition('draft', 'editing')).toBe(false);
    expect(isValidTransition('draft', 'in_review')).toBe(false);
    expect(isValidTransition('purged', 'extracted')).toBe(false);
    expect(isValidTransition('extracted', 'extracted')).toBe(false);
  });
});
