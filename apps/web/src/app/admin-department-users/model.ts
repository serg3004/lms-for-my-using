export type MembershipUser = { firstName: string; lastName: string | null; email: string };

export function formatMembershipUserName(user: MembershipUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function membershipCandidatesAvailableToAdd<T extends { id: string }>(allUsers: T[], excludeIds: string[]): T[] {
  const excluded = new Set(excludeIds);
  return allUsers.filter((user) => !excluded.has(user.id));
}

export function resolveMembershipErrorMessage(status: number | undefined, conflictMessage: string, genericMessage: string): string {
  return status === 409 ? conflictMessage : genericMessage;
}
