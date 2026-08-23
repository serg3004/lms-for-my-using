import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiRequest, getCurrentUser, type CurrentUser } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { EMPTY_USER_FILTERS, userName, userRole, type AdminUserSummary, type AdminUsersFilters } from './model.js';

export type AdminUsersLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[]; currentUser: CurrentUser; total: number; pageSize: number }
  | { status: 'unauthenticated' | 'error'; message: string };

type AdminUsersData = { users: AdminUserSummary[]; currentUser: CurrentUser; total: number; pageSize: number };

export function filterAdminUsers(users: AdminUserSummary[], filters: AdminUsersFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return users.filter((user) => {
    const matchesQuery = !query || `${userName(user)} ${user.email}`.toLocaleLowerCase().includes(query);
    return matchesQuery && (!filters.role || userRole(user) === filters.role) && (!filters.status || user.status === filters.status);
  });
}

export function useAdminUsers() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminUsersFilters>(EMPTY_USER_FILTERS);

  const { state: asyncState, reload } = useAsyncData<AdminUsersData>(
    async () => {
      const [result, currentUser] = await Promise.all([
        apiRequest<PaginatedResponse<AdminUserSummary>>(`/users?page=${page}&pageSize=20`), getCurrentUser(),
      ]);
      return { users: result.items, currentUser, total: result.total, pageSize: result.pageSize };
    },
    [page, t],
    {
      unauthenticated: t('admin.users.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.users.loadError', 'Unable to load users. Try again later.'),
    },
  );

  const state: AdminUsersLoadState = useMemo(() => {
    if (asyncState.status === 'loaded') return { status: 'loaded', ...asyncState.data };
    if (asyncState.status === 'notFound') return { status: 'error', message: asyncState.message };
    return asyncState;
  }, [asyncState]);

  const users = useMemo(() => state.status === 'loaded' ? filterAdminUsers(state.users, filters) : [], [filters, state]);

  function updateFilters(next: AdminUsersFilters) {
    setFilters(next);
    setPage(1);
  }

  return { state, users, page, setPage, filters, setFilters: updateFilters, reload };
}
