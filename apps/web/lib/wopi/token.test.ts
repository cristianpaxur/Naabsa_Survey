import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from './token';

const SECRET = 'test-secret-0123456789abcdef';

describe('wopi/token', () => {
  it('faz round-trip dos claims', () => {
    const t = signToken({ reportId: 'r1', userId: 'u1', canWrite: true }, 3600, SECRET);
    expect(verifyToken(t, SECRET)).toMatchObject({
      reportId: 'r1',
      userId: 'u1',
      canWrite: true,
    });
  });

  it('rejeita token adulterado', () => {
    const t = signToken({ reportId: 'r1', userId: 'u1', canWrite: true }, 3600, SECRET);
    const tampered = `X${t.slice(1)}`; // muda o corpo → assinatura não confere
    expect(verifyToken(tampered, SECRET)).toBeNull();
  });

  it('rejeita segredo errado', () => {
    const t = signToken({ reportId: 'r1', userId: 'u1', canWrite: true }, 3600, SECRET);
    expect(verifyToken(t, 'outro-segredo')).toBeNull();
  });

  it('rejeita token expirado', () => {
    const t = signToken({ reportId: 'r1', userId: 'u1', canWrite: false }, -1, SECRET);
    expect(verifyToken(t, SECRET)).toBeNull();
  });

  it('rejeita formato inválido', () => {
    expect(verifyToken('sem-ponto', SECRET)).toBeNull();
    expect(verifyToken('', SECRET)).toBeNull();
  });
});
