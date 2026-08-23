import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';

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

type AdminRolesData = { users: AdminUserSummary[]; memberships: MembershipSummary[] };

const adminRoles: AdminRole[] = ['learner', 'instructor', 'manager', 'admin'];

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  admin: 'Full system access.',
  instructor: 'Courses and learners.',
  manager: 'Team and results.',
  learner: 'Learning and certificates.',
};

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
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AdminRole>('learner');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const navItems: AdminNavItem[] = [
    { label: t('admin.roles.title', 'Roles'), href: '/admin/roles', isCurrent: true },
  ];

  const { state: loadState, reload: loadRoleData } = useAsyncData<AdminRolesData>(
    async () => {
      const [{ items: users }, memberships] = await Promise.all([
        apiRequest<PaginatedResponse<AdminUserSummary>>('/users?pageSize=200'),
        apiRequest<MembershipSummary[]>('/memberships'),
      ]);
      return { users, memberships };
    },
    [t],
    {
      unauthenticated: t('admin.roles.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.roles.loadError', 'Unable to load role assignments. Try again later.'),
    },
  );

  useEffect(() => {
    if (loadState.status === 'loaded') {
      setSelectedUserId((currentUserId) => currentUserId || loadState.data.users[0]?.id || '');
    }
  }, [loadState]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedUserId) {
      return;
    }

    const selectedUser = loadState.data.users.find((user) => user.id === selectedUserId);

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

  if (loadState.status === 'loading') {
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

  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.roles.title', 'Roles')} message={loadState.message} variant="error" />
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
        eyebrow={t('admin.roles.eyebrow', 'Access control')}
        title={t('admin.roles.title', 'Roles')}
        subtitle={t('admin.roles.subtitle', 'Assign existing organization roles to users.')}
      />

      <section className="admin-dashboard-widgets" style={{ marginBottom: '20px' }}>
        {adminRoles.map((role) => {
          const count = loadState.data.memberships.filter((m) => m.role === role).length;
          return (
            <AdminCard key={role}>
              <span className="ds-badge ds-badge--neutral">{count}</span>
              <h3 style={{ margin: '10px 0 4px' }}>{t(`admin.roles.options.${role}`, role)}</h3>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                {t(`admin.roles.descriptions.${role}`, ROLE_DESCRIPTIONS[role])}
              </p>
            </AdminCard>
          );
        })}
      </section>

      <section className="admin-content-grid">
        <AdminCard>
          <h2>{t('admin.roles.assignTitle', 'Assign role')}</h2>
          {loadState.data.users.length === 0 ? (
            <EmptyState message={t('admin.roles.noUsers', 'No users are available for role assignment.')} />
          ) : (
            <form onSubmit={handleSubmit}>
              <label>
                {t('admin.roles.user', 'User')}
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  {loadState.data.users.map((user) => (
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
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.roles.currentTitle', 'Current assignments')}</h2>
          {loadState.data.memberships.length === 0 ? (
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
                {loadState.data.memberships.map((membership) => (
                  <tr key={membership.id}>
                    <td>{getMembershipUserLabel(loadState.data.users, membership.userId)}</td>
                    <td>
                      <StatusBadge>{t(`admin.roles.options.${membership.role}`, membership.role)}</StatusBadge>
                    </td>
                    <td>{formatDate(membership.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}
