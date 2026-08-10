type NamedUser = { id: string; firstName: string; lastName: string | null; email: string };
type InstructorCandidateUser = NamedUser & { memberships?: Array<{ role: string }> };

export function formatUserName(user: NamedUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function usersAvailableToAdd(allUsers: InstructorCandidateUser[], excludeIds: string[]) {
  const excluded = new Set(excludeIds);
  return allUsers.filter(
    (user) => !excluded.has(user.id) && user.memberships?.some((membership) => membership.role === 'instructor') === true,
  );
}
