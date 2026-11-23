/** Compartilhado pelo middleware e WOPI; nenhuma confiança em papel/status do cliente. */
export interface AccessProfile {
  role?: string;
  status?: string;
  access_revoked_at?: string | null;
}

export function isActiveProfile(profile: AccessProfile | null | undefined): boolean {
  return profile?.status === 'active' && (profile.role === 'admin' || profile.role === 'operator');
}

/** Tokens anteriores à desativação não voltam a valer quando a conta é reativada. */
export function isCurrentAccessToken(profile: AccessProfile, issuedAt?: number): boolean {
  if (!isActiveProfile(profile)) return false;
  if (!profile.access_revoked_at) return true;
  const revokedAt = Date.parse(profile.access_revoked_at);
  return Number.isFinite(revokedAt) && typeof issuedAt === 'number'
    && Number.isFinite(issuedAt) && issuedAt * 1000 > revokedAt;
}
