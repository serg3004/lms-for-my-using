type NamedUser = { id: string; firstName: string; lastName: string | null; email: string };

export function formatUserName(user: NamedUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function usersAvailableToAdd(allUsers: NamedUser[], excludeIds: string[]) {
  const excluded = new Set(excludeIds);
  return allUsers.filter((user) => !excluded.has(user.id));
}
