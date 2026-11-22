import { PrismaService } from '../../database/prisma.service.js';

/** PR 501: the machine key of the standard "Employee number" user field (the field itself lives in the user-fields module, which depends on auth). */
export const EMPLOYEE_NUMBER_KEY = 'employee_number';

/** The same comparison the user fields use: trimmed, inner spaces collapsed, lower case. */
export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? '').trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase();
}

export type IdentityName = { lastName: string; firstName?: string | null; middleName?: string | null };

/** Last name always; first and middle names too when `full`. An empty middle name in the card only matches an empty one. */
export function namesMatch(card: IdentityName & { firstName: string }, given: IdentityName, full: boolean): boolean {
  if (normalizeIdentityText(card.lastName) !== normalizeIdentityText(given.lastName)) return false;
  if (!full) return true;
  return normalizeIdentityText(card.firstName) === normalizeIdentityText(given.firstName)
    && normalizeIdentityText(card.middleName) === normalizeIdentityText(given.middleName);
}

/**
 * Finds the one non-deleted user of the organization whose active "Employee number" field holds this number.
 * If the field is gone, archived, or the number is shared by several people, nobody is found.
 */
export async function findUserIdByEmployeeNumber(prisma: PrismaService, organizationId: string, employeeNumber: string): Promise<string | null> {
  const normalized = normalizeIdentityText(employeeNumber);
  if (!normalized) return null;
  const values = await prisma.userFieldValue.findMany({
    where: { organizationId, normalizedValue: normalized, field: { key: EMPLOYEE_NUMBER_KEY, archivedAt: null }, user: { deletedAt: null } },
    select: { userId: true },
    take: 2,
  });
  return values.length === 1 ? values[0]!.userId : null;
}
