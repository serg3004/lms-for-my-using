import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type AdminUserSummary = {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
};

type MembershipSummary = {
  id: string;
  organizationId: string;
  userId: string;
  role: AdminRole;
  assignedBy: string | null;
  createdAt: string;
};

type AdminRole = 'learner' | 'instructor' | 'manager' | 'admin';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[]; memberships: MembershipSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

const adminRoles: AdminRole[] = ['learner', 'instructor', 'manager', 'admin'];

function getUserDisplayName(user: AdminUserSummary) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

  return fullName || user.email;
}

function getUserLabel(user: AdminUserSummary) {
  return `${getUserDisplayName(user)} · ${user.email}`;
}

function getMembershipUserLabel(users: AdminUserSummary[], userId: string) {
  const user = users.find((item) => item.id === userId);

  return user ? getUserLabel(user) : userId;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminRolesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AdminRole>('learner');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const loadRoleData = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const [users, memberships] = await Promise.all([
        apiRequest<AdminUserSummary[]>('/users'),
        apiRequest<MembershipSummary[]>('/memberships'),
      ]);

      setLoadState({ status: 'loaded', users, memberships });
      setSelectedUserId((currentUserId) => currentUserId || users[0]?.id || '');
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({
          status: 'unauthenticated',
          message: t('admin.roles.sessionExpired', 'Your session expired. Sign in again.'),
        });
        return;
      }

      setLoadState({
        status: 'error',
        message: t('admin.roles.loadError', 'Unable to load role assignments. Try again later.'),
      });
    }
  }, [t]);

  useEffect(() => {
    void loadRoleData();
  }, [loadRoleData]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedUserId) {
      return;
    }

    const selectedUser = loadState.users.find((user) => user.id === selectedUserId);

    if (!selectedUser) {
      setSubmitState({
        status: 'error',
        message: t('admin.roles.userNotFound', 'Selected user was not found.'),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<MembershipSummary>('/memberships', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedUser.organizationId,
          userId: selectedUser.id,
          role: selectedRole,
        }),
      });
      setSubmitState({ status: 'idle' });
      await loadRoleData();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.roles.alreadyAssigned', 'This role is already assigned to the selected user.')
          : t('admin.roles.saveError', 'Unable to assign role. Try again later.');

      setSubmitState({ status: 'error', message });
    }
  }

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.roles.loading', 'Loading role assignments...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.roles.title', 'Roles')}
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
        <PageState title={t('admin.roles.title', 'Roles')} message={loadState.message} variant="error" />
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
          <a className="admin-nav-link" href="/admin/users">
            {t('admin.users.title', 'Users')}
          </a>
          <a className="admin-nav-link" href="/admin/roles" aria-current="page">
            {t('admin.roles.title', 'Roles')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.roles.title', 'Roles')}</h1>
            <p>{t('admin.roles.subtitle', 'Assign existing organization roles to users.')}</p>
          </div>
          <a href="/admin">{t('admin.roles.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.roles.assignTitle', 'Assign role')}</h2>
            {loadState.users.length === 0 ? (
              <EmptyState message={t('admin.roles.noUsers', 'No users are available for role assignment.')} />
            ) : (
              <form onSubmit={handleSubmit}>
                <label>
                  {t('admin.roles.user', 'User')}
                  <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                    {loadState.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getUserLabel(user)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t('admin.roles.role', 'Role')}
                  <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as AdminRole)}>
                    {adminRoles.map((role) => (
                      <option key={role} value={role}>
                        {t(`admin.roles.options.${role}`, role)}
                      </option>
                    ))}
                  </select>
                </label>

                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}

                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving'
                    ? t('admin.roles.saving', 'Assigning...')
                    : t('admin.roles.submit', 'Assign role')}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.roles.currentTitle', 'Current assignments')}</h2>
            {loadState.memberships.length === 0 ? (
              <EmptyState message={t('admin.roles.empty', 'No role assignments found.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.roles.user', 'User')}</th>
                    <th>{t('admin.roles.role', 'Role')}</th>
                    <th>{t('admin.roles.createdAt', 'Assigned at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadState.memberships.map((membership) => (
                    <tr key={membership.id}>
                      <td>{getMembershipUserLabel(loadState.users, membership.userId)}</td>
                      <td>
                        <StatusBadge>{membership.role}</StatusBadge>
                      </td>
                      <td>{formatDate(membership.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
