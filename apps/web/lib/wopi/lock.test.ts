import { describe, it, expect } from 'vitest';
import { currentLock, lockDecision, type WopiReport } from './lock';

function report(lock: string | null, expISO: string | null): WopiReport {
  return {
    id: 'r1',
    status: 'editing',
    vessel_name: 'HG ANTWERP',
    working_docx_path: 'r1/working.docx',
    wopi_lock: lock,
    wopi_lock_expires_at: expISO,
  };
}

describe('wopi/lock currentLock', () => {
  const now = 1_000_000;
  it('null quando não há lock', () => {
    expect(currentLock(report(null, null), now)).toBeNull();
  });
  it('null quando expirado', () => {
    expect(currentLock(report('L', new Date(now - 1).toISOString()), now)).toBeNull();
  });
  it('devolve o lock quando válido', () => {
    expect(currentLock(report('L', new Date(now + 60_000).toISOString()), now)).toBe('L');
  });
});

describe('wopi/lock lockDecision', () => {
  it('GET_LOCK devolve o lock corrente no header', () => {
    expect(lockDecision('GET_LOCK', 'L', 'X')).toEqual({ status: 200, lockHeader: 'L' });
    expect(lockDecision('GET_LOCK', null, 'X')).toEqual({ status: 200, lockHeader: '' });
  });

  it('LOCK em doc destravado trava', () => {
    expect(lockDecision('LOCK', null, 'A')).toEqual({ status: 200, newLock: 'A' });
  });
  it('LOCK com o mesmo lock re-trava (200)', () => {
    expect(lockDecision('LOCK', 'A', 'A')).toEqual({ status: 200, newLock: 'A' });
  });
  it('LOCK com lock divergente → 409 (CA-005)', () => {
    const out = lockDecision('LOCK', 'A', 'B');
    expect(out.status).toBe(409);
    expect(out.lockHeader).toBe('A');
    expect(out.newLock).toBeUndefined();
  });

  it('REFRESH_LOCK válido renova', () => {
    expect(lockDecision('REFRESH_LOCK', 'A', 'A')).toEqual({ status: 200, newLock: 'A' });
  });
  it('REFRESH_LOCK sem lock ou divergente → 409', () => {
    expect(lockDecision('REFRESH_LOCK', null, 'A').status).toBe(409);
    expect(lockDecision('REFRESH_LOCK', 'A', 'B').status).toBe(409);
  });

  it('UNLOCK válido destrava (newLock null)', () => {
    expect(lockDecision('UNLOCK', 'A', 'A')).toEqual({ status: 200, newLock: null });
  });
  it('UNLOCK divergente → 409', () => {
    expect(lockDecision('UNLOCK', 'A', 'B').status).toBe(409);
  });

  it('operação desconhecida → 400', () => {
    expect(lockDecision('FROBNICATE', null, '')).toEqual({ status: 400 });
  });
});
