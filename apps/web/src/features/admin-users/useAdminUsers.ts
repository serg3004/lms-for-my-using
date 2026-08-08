import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest, getCurrentUser, type CurrentUser } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { EMPTY_USER_FILTERS, userName, userRole, type AdminUserSummary, type AdminUsersFilters } from './model.js';

export type AdminUsersLoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[]; currentUser: CurrentUser; total: number; pageSize: number }
  | { status: 'unauthenticated' | 'error'; message: string };

export function filterAdminUsers(users: AdminUserSummary[], filters: AdminUsersFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return users.filter((user) => {
    const matchesQuery = !query || `${userName(user)} ${user.email}`.toLocaleLowerCase().includes(query);
    return matchesQuery && (!filters.role || userRole(user) === filters.role) && (!filters.status || user.status === filters.status);
  });
}

export function useAdminUsers() {
  const { t } = useTranslation();
  const [state, setState] = useState<AdminUsersLoadState>({ status: 'idle' });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminUsersFilters>(EMPTY_USER_FILTERS);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [result, currentUser] = await Promise.all([
        apiRequest<PaginatedResponse<AdminUserSummary>>(`/users?page=${page}&pageSize=20`), getCurrentUser(),
      ]);
      setState({ status: 'loaded', users: result.items, currentUser, total: result.total, pageSize: result.pageSize });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setState({ status: 'unauthenticated', message: t('admin.users.sessionExpired', 'Your session expired. Sign in again.') });
      } else setState({ status: 'error', message: t('admin.users.loadError', 'Unable to load users. Try again later.') });
    }
  }, [page, t]);

  useEffect(() => { void reload(); }, [reload]);
  const users = useMemo(() => state.status === 'loaded' ? filterAdminUsers(state.users, filters) : [], [filters, state]);

  function updateFilters(next: AdminUsersFilters) {
    setFilters(next);
    setPage(1);
  }

  return { state, users, page, setPage, filters, setFilters: updateFilters, reload };
}
