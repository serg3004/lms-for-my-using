import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';
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

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('admin.users.authRequired', 'Sign in to manage users.'),
        });
        return;
      }

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
    <main className="admin-layout">
      <aside className="admin-sidebar" aria-label={t('admin.sidebarLabel', 'Admin navigation')}>
        <a className="admin-brand" href="/admin">
          {t('admin.navLink', 'Admin')}
        </a>
        <nav className="admin-nav">
          <a className="admin-nav-link" href="/admin">
            {t('admin.title', 'Admin dashboard')}
          </a>
          <a className="admin-nav-link" href="/admin/users" aria-current="page">
            {t('admin.users.title', 'Users')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.users.title', 'Users')}</h1>
            <p>{t('admin.users.subtitle', 'View organization users and account statuses.')}</p>
          </div>
          <a href="/admin">{t('admin.users.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <article className="admin-card">
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
        </article>
      </section>
    </main>
  );
}
