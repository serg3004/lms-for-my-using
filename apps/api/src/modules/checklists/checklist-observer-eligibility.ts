import type { ChecklistObserverEligibility, Prisma, UserRole } from '@prisma/client';

export const DEFAULT_OBSERVER_ROLES: UserRole[] = ['instructor', 'manager', 'admin'];
export const DEFAULT_OBSERVER_SELECTION = {
  observerEligibility: 'selected_roles' as ChecklistObserverEligibility,
  observerRoles: DEFAULT_OBSERVER_ROLES,
  observerUserIds: [] as string[],
};

/** Eligibility controls future selection only; never apply it to existing session access. */
export async function eligibleObserverScope(tx: Prisma.TransactionClient, organizationId: string): Promise<Prisma.UserWhereInput> {
  const settings = await tx.checklistWorkplaceSettings.findUnique({
    where: { organizationId },
    select: { observerEligibility: true, observerRoles: true, observerUserIds: true },
  }) ?? DEFAULT_OBSERVER_SELECTION;
  const selection: Prisma.UserWhereInput = settings.observerEligibility === 'any_user'
    ? {}
    : settings.observerEligibility === 'selected_users'
      ? { id: { in: settings.observerUserIds } }
      : { memberships: { some: { organizationId, role: { in: settings.observerRoles } } } };
  return { organizationId, status: 'active', deletedAt: null, AND: [selection] };
}
