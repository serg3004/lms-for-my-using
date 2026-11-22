import type { UserFieldsService } from '../modules/user-fields/public.js';

/** A user-fields service for specs that do not test custom fields: no definitions, nothing to read or write. */
export const noUserFields = {
  readValues: async (_organizationId: string, userIds: string[]) => new Map(userIds.map((id) => [id, {}])),
  loadActive: async () => [],
  searchClause: () => null,
  filterClause: async () => ({}),
  assertNoRequired: async () => undefined,
  applyValues: async () => [],
  syncShiftToSchedule: async () => undefined,
  persist: async () => undefined,
  takenUniqueFields: async () => [],
} as unknown as UserFieldsService;
