import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSaveProof, signSaveProof } from './document-save-proof';

beforeEach(() => { vi.stubEnv('WOPI_TOKEN_SECRET', 'test-secret-local-only'); });
describe('recibo de versão persistida', () => {
  const saved = { kind: 'saved', reportId: 'r1', userId: 'u1', revision: 12, path: 'r1/working/saved.docx' } as const;
  it('valida apenas usuário, relatório e finalidade correspondentes', () => {
    const token = signSaveProof(saved);
    expect(readSaveProof(token, 'saved', 'r1', 'u1')?.revision).toBe(12);
    expect(readSaveProof(token, 'saved', 'r2', 'u1')).toBeNull();
    expect(readSaveProof(token, 'saved', 'r1', 'u2')).toBeNull();
    expect(readSaveProof(token, 'request', 'r1', 'u1')).toBeNull();
  });
  it('rejeita adulteração de revisão e recibo expirado', () => {
    const token = signSaveProof(saved);
    const [body, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString());
    payload.revision = 99;
    expect(readSaveProof(`${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`, 'saved', 'r1', 'u1')).toBeNull();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    expect(readSaveProof(token, 'saved', 'r1', 'u1')).toBeNull();
    now.mockRestore();
  });
});
