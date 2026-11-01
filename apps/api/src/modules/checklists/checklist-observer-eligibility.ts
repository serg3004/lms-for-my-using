import type { Prisma } from '@prisma/client';

import { loadEffectiveSettings } from './checklist-settings-overrides.js';

export { DEFAULT_OBSERVER_ROLES, DEFAULT_OBSERVER_SELECTION } from './checklist-observer-defaults.js';

/**
 * Eligibility controls future selection only; never apply it to existing session access.
 * PR 397: with a `checklistId` the sheet's observer override (if any) replaces the organization's list.
 */
export async function eligibleObserverScope(tx: Prisma.TransactionClient, organizationId: string, checklistId: string | null = null): Promise<Prisma.UserWhereInput> {
  const settings = await loadEffectiveSettings(tx, organizationId, checklistId);
  const selection: Prisma.UserWhereInput = settings.observerEligibility === 'any_user'
    ? {}
    : settings.observerEligibility === 'selected_users'
      ? { id: { in: settings.observerUserIds } }
      : { memberships: { some: { organizationId, role: { in: settings.observerRoles } } } };
  return { organizationId, status: 'active', deletedAt: null, AND: [selection] };
}
