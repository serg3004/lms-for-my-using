type GroupManager = { manager: { id: string; firstName: string; lastName: string } };
type GroupWithManagers = { location: string | null; managers: GroupManager[] };

export function managerNames(group: { managers: GroupManager[] }) {
  return group.managers.map(({ manager }) => `${manager.firstName} ${manager.lastName}`).join(', ');
}

export function formatManagerCell(group: { managers: GroupManager[] }) {
  return managerNames(group) || '—';
}

export function resolveGroupSaveErrorMessage(status: number | undefined, groupExistsMessage: string, genericMessage: string) {
  return status === 409 ? groupExistsMessage : genericMessage;
}

export function countUniqueManagers(groups: GroupWithManagers[]) {
  return new Set(groups.flatMap((group) => group.managers.map(({ manager }) => manager.id))).size;
}

export function countUniqueLocations(groups: GroupWithManagers[]) {
  return new Set(groups.map((group) => group.location).filter((value): value is string => Boolean(value))).size;
}

export function computeGroupStats(groups: GroupWithManagers[], employeeCount: number) {
  return {
    groups: groups.length,
    employees: employeeCount,
    managers: countUniqueManagers(groups),
    locations: countUniqueLocations(groups),
  };
}

export function buildCreateGroupPayload(
  organizationId: string,
  slug: string,
  form: { name: string; location: string; description: string },
) {
  return {
    organizationId,
    name: form.name.trim(),
    slug,
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
  };
}

export function initialCreateFormState() {
  return { name: '', location: '', description: '' };
}

export function initialEditFormState(group: { name: string; location: string | null; description: string | null; status: 'active' | 'archived' }) {
  return {
    name: group.name,
    location: group.location ?? '',
    description: group.description ?? '',
    status: group.status,
  };
}

export function validateGroupName(name: string, message: string): { name?: string } {
  return name.trim() ? {} : { name: message };
}

export function buildUpdateGroupPayload(form: {
  name: string;
  location: string;
  description: string;
  status: 'active' | 'archived';
}) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    location: form.location.trim() || null,
    status: form.status,
  };
}

type NamedUser = { id: string; firstName: string; lastName: string | null; email: string };

export function formatUserName(user: NamedUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function usersAvailableToAdd(allUsers: NamedUser[], excludeIds: string[]) {
  const excluded = new Set(excludeIds);
  return allUsers.filter((user) => !excluded.has(user.id));
}
