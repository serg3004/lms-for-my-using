import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type AdminUserSummary = {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  position: string | null;
  shift: string | null;
  phone: string | null;
  status: string;
  locale: string;
  timezone: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UsersLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getUserDisplayName(user: AdminUserSummary) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

  return fullName || user.email;
}

function formatOptionalDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

function getStatusTone(status: string) {
  return status === 'active' ? 'success' : 'neutral';
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<UsersLoadState>({ status: 'idle' });

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users', isCurrent: true },
  ];

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      setLoadState({ status: 'loading' });

      try {
        const users = await apiRequest<AdminUserSummary[]>('/users');

        if (isMounted) {
          setLoadState({ status: 'loaded', users });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('admin.users.sessionExpired', 'Your session expired. Sign in again.'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('admin.users.loadError', 'Unable to load users. Try again later.'),
        });
      }
    }

    void loadUsers();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.users.loading', 'Loading users...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.users.title', 'Users')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.users.title', 'Users')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.users.title', 'Users')}
        subtitle={t('admin.users.subtitle', 'View organization users and account statuses.')}
        action={<a href="/admin">{t('admin.users.backToDashboard', 'Back to dashboard')}</a>}
      />

      <AdminCard>
        {loadState.users.length === 0 ? (
          <EmptyState message={t('admin.users.empty', 'No users found.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('admin.users.name', 'Name')}</th>
                <th>{t('admin.users.email', 'Email')}</th>
                <th>{t('admin.users.position', 'Position')}</th>
                <th>{t('admin.users.status', 'Status')}</th>
                <th>{t('admin.users.lastLoginAt', 'Last login')}</th>
              </tr>
            </thead>
            <tbody>
              {loadState.users.map((user) => (
                <tr key={user.id}>
                  <td>{getUserDisplayName(user)}</td>
                  <td>{user.email}</td>
                  <td>{user.position || t('admin.users.notAvailable', 'Not available')}</td>
                  <td>
                    <StatusBadge tone={getStatusTone(user.status)}>{user.status}</StatusBadge>
                  </td>
                  <td>{formatOptionalDate(user.lastLoginAt, t('admin.users.neverLoggedIn', 'Never'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
