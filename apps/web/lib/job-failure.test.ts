import { describe, it, expect } from 'vitest';
import { latestJobOutcome, type AuditEventRow } from './job-failure';

// Linhas em ordem DESC de criação (mais recente primeiro), como a query devolve.
const enq = (): AuditEventRow => ({ action: 'pdf_enqueued', payload: null });
const fail = (message?: string): AuditEventRow => ({
  action: 'pdf_generation_failed',
  payload: message ? { message } : null,
});

describe('latestJobOutcome (014/T-003, RF-002/003)', () => {
  it('sem eventos → não falhou (job pode nem ter sido enfileirado)', () => {
    expect(latestJobOutcome([], 'pdf_enqueued', 'pdf_generation_failed')).toEqual({
      failed: false,
    });
  });

  it('enfileirado sem falha → não falhou (em andamento)', () => {
    expect(latestJobOutcome([enq()], 'pdf_enqueued', 'pdf_generation_failed')).toEqual({
      failed: false,
    });
  });

  it('falha mais recente que o enfileiramento → falhou, com motivo', () => {
    const rows = [fail('LibreOffice timeout'), enq()];
    expect(latestJobOutcome(rows, 'pdf_enqueued', 'pdf_generation_failed')).toEqual({
      failed: true,
      reason: 'LibreOffice timeout',
    });
  });

  it('retentativa (novo enfileiramento) supera a falha anterior', () => {
    const rows = [enq(), fail('erro velho'), enq()];
    expect(latestJobOutcome(rows, 'pdf_enqueued', 'pdf_generation_failed')).toEqual({
      failed: false,
    });
  });

  it('falha sem payload → failed sem reason', () => {
    expect(latestJobOutcome([fail()], 'pdf_enqueued', 'pdf_generation_failed')).toEqual({
      failed: true,
      reason: undefined,
    });
  });

  it('ignora ações de outros jobs', () => {
    const rows: AuditEventRow[] = [
      { action: 'transition', payload: null },
      fail('x'),
    ];
    expect(latestJobOutcome(rows, 'pdf_enqueued', 'pdf_generation_failed').failed).toBe(true);
  });
});
