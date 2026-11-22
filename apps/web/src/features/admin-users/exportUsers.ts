import { apiRequest } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import type { FieldLanguage, UserFieldView } from '../../shared/api/userFields.js';
import { displayValue, fieldLabel, } from '../user-fields/model.js';
import { formulaSafe } from '../admin-users-import/importFile.js';
import { userName, userRole, type AdminUserSummary, type AdminUsersFilters } from './model.js';
import { usersUrl } from './useAdminUsers.js';

export const EXPORT_MAX_ROWS = 5000;

/** Every page of the current list (search, status and field filter as shown), up to a ceiling; the role filter is applied here as on the page. */
export async function loadAllUsers(filters: AdminUsersFilters): Promise<AdminUserSummary[]> {
  const items: AdminUserSummary[] = [];
  for (let page = 1; items.length < EXPORT_MAX_ROWS; page += 1) {
    const result = await apiRequest<PaginatedResponse<AdminUserSummary>>(usersUrl(page, filters.query, filters).replace('pageSize=20', 'pageSize=200'));
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) break;
  }
  return filters.role ? items.filter((user) => userRole(user) === filters.role) : items;
}

type Words = { name: string; email: string; role: string; status: string; yes: string; no: string; roleLabel: (role: string) => string; statusLabel: (status: string) => string };

/** Rows of the spreadsheet: the standard columns and the chosen custom fields; a text that a spreadsheet would read as a formula is made harmless. */
export function exportRows(users: AdminUserSummary[], fields: UserFieldView[], language: FieldLanguage, words: Words): string[][] {
  const safe = formulaSafe;
  return [
    [words.name, words.email, words.role, words.status, ...fields.map((field) => fieldLabel(field, language))],
    ...users.map((user) => [
      userName(user), user.email, user.memberships.map((member) => words.roleLabel(member.role)).join(', '), words.statusLabel(user.status),
      ...fields.map((field) => displayValue(field, user.customFields?.[field.key], language, words.yes, words.no)),
    ].map(safe)),
  ];
}
