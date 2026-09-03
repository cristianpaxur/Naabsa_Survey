export type UserRole = 'admin' | 'operator';
export type UserStatus = 'active' | 'inactive';

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function isUserRole(value: string): value is UserRole {
  return value === 'admin' || value === 'operator';
}

export function isUserStatus(value: string): value is UserStatus {
  return value === 'active' || value === 'inactive';
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8;
}

export function wouldRemoveLastActiveAdmin(input: {
  currentRole: UserRole;
  currentStatus: string;
  nextRole?: UserRole;
  nextStatus?: UserStatus;
  activeAdminCount: number;
}): boolean {
  const currentlyActiveAdmin =
    input.currentRole === 'admin' && input.currentStatus === 'active';
  const remainsActiveAdmin =
    (input.nextRole ?? input.currentRole) === 'admin' &&
    (input.nextStatus ?? input.currentStatus) === 'active';
  return (
    currentlyActiveAdmin && !remainsActiveAdmin && input.activeAdminCount <= 1
  );
}
