import type { ChecklistObserverEligibility, UserRole } from '@prisma/client';

export const DEFAULT_OBSERVER_ROLES: UserRole[] = ['instructor', 'manager', 'admin'];
export const DEFAULT_OBSERVER_SELECTION = {
  observerEligibility: 'selected_roles' as ChecklistObserverEligibility,
  observerRoles: DEFAULT_OBSERVER_ROLES,
  observerUserIds: [] as string[],
};
