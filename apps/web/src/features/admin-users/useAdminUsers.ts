import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiRequest, type CurrentUser } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { useSession } from '../../shared/session.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { EMPTY_USER_FILTERS, userName, userRole, type AdminUserSummary, type AdminUsersFilters } from './model.js';

export type AdminUsersLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[]; currentUser: CurrentUser; total: number; pageSize: number }
  | { status: 'unauthenticated' | 'error'; message: string };

type AdminUsersData = { users: AdminUserSummary[]; total: number; pageSize: number };

export function filterAdminUsers(users: AdminUserSummary[], filters: AdminUsersFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return users.filter((user) => {
    const matchesQuery = !query || `${userName(user)} ${user.email}`.toLocaleLowerCase().includes(query);
    return matchesQuery && (!filters.role || userRole(user) === filters.role) && (!filters.status || user.status === filters.status);
  });
}

/** PR 500: search, status and the custom field filter are the server's (a search also finds values of searchable fields); the role filter stays on the page. */
export function usersUrl(page: number, query: string, filters: AdminUsersFilters) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (query.trim()) params.set('search', query.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.fieldKey && filters.fieldValue) { params.set('fieldKey', filters.fieldKey); params.set('fieldValue', filters.fieldValue); }
  return `/users?${params.toString()}`;
}

export function useAdminUsers() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminUsersFilters>(EMPTY_USER_FILTERS);

  // The typed search reaches the server a moment after the last keystroke.
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const settledQuery = useRef(filters.query);
  useEffect(() => {
    const timer = setTimeout(() => { settledQuery.current = filters.query; bump(); }, 300);
    return () => clearTimeout(timer);
  }, [filters.query]);

  const { state: asyncState, reload } = useAsyncData<AdminUsersData>(
    async () => {
      const result = await apiRequest<PaginatedResponse<AdminUserSummary>>(usersUrl(page, settledQuery.current, filters));
      return { users: result.items, total: result.total, pageSize: result.pageSize };
    },
    [page, t, settledQuery.current, filters.status, filters.fieldKey, filters.fieldValue],
    {
      unauthenticated: t('admin.users.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.users.loadError', 'Unable to load users. Try again later.'),
    },
  );

  // While a new filter loads, the page keeps showing the last rows: the search box must not disappear under the typing hand.
  const lastData = useRef<AdminUsersData | null>(null);
  if (asyncState.status === 'loaded') lastData.current = asyncState.data;
  const state: AdminUsersLoadState = useMemo(() => {
    if (asyncState.status === 'loaded') return { status: 'loaded', ...asyncState.data, currentUser: currentUser! };
    if (asyncState.status === 'loading' && lastData.current) return { status: 'loaded', ...lastData.current, currentUser: currentUser! };
    if (asyncState.status === 'notFound') return { status: 'error', message: asyncState.message };
    return asyncState;
  }, [asyncState, currentUser]);

  const users = useMemo(() => state.status === 'loaded' ? filterAdminUsers(state.users, { ...filters, query: '', status: '' }) : [], [filters, state]);

  function updateFilters(next: AdminUsersFilters) {
    setFilters(next);
    setPage(1);
  }

  return { state, users, page, setPage, filters, setFilters: updateFilters, reload };
}
