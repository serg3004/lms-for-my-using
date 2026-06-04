import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';

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
  memberships: Array<{ role: UserRole }>;
};

type PageLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUserSummary[]; currentUser: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type CreateFormState = { status: 'idle' } | { status: 'submitting' } | { status: 'error'; message: string };

type CreateFormFields = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  password: string;
  role: UserRole | '';
};

const EMPTY_FORM: CreateFormFields = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  password: '',
  role: '',
};

const USER_ROLES: UserRole[] = ['learner', 'instructor', 'manager', 'admin'];

function getUserDisplayName(user: AdminUserSummary) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

  return fullName || user.email;
}

function formatOptionalDate(value: string | null, fallback: string) {
  if (!value) return fallback;

  return new Date(value).toLocaleString();
}

function getStatusTone(status: string) {
  return status === 'active' ? 'success' : 'neutral';
}

function getUserRoles(user: AdminUserSummary): string {
  if (user.memberships.length === 0) return '—';

  return user.memberships.map((m) => m.role).join(', ');
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateFormFields>(EMPTY_FORM);
  const [formState, setFormState] = useState<CreateFormState>({ status: 'idle' });
  const dialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users', isCurrent: true },
  ];

  async function loadData() {
    setPageState({ status: 'loading' });

    try {
      const [users, currentUser] = await Promise.all([
        apiRequest<AdminUserSummary[]>('/users'),
        getCurrentUser(),
      ]);

      setPageState({ status: 'loaded', users, currentUser });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setPageState({
          status: 'unauthenticated',
          message: t('admin.users.sessionExpired', 'Your session expired. Sign in again.'),
        });

        return;
      }

      setPageState({
        status: 'error',
        message: t('admin.users.loadError', 'Unable to load users. Try again later.'),
      });
    }
  }

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showCreate) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [showCreate]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormState({ status: 'idle' });
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (pageState.status !== 'loaded') return;

    setFormState({ status: 'submitting' });

    const { organizationId } = pageState.currentUser;

    try {
      const created = await apiRequest<AdminUserSummary>('/users', {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          middleName: form.middleName || undefined,
        }),
      });

      if (form.role) {
        await apiRequest('/memberships', {
          method: 'POST',
          body: JSON.stringify({
            organizationId,
            userId: created.id,
            role: form.role,
          }),
        });
      }

      closeCreate();
      void loadData();
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : t('admin.users.createError', 'Failed to create user. Try again.');

      setFormState({ status: 'error', message });
    }
  }

  async function handleStatusToggle(user: AdminUserSummary) {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';

    try {
      const updated = await apiRequest<AdminUserSummary>(`/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      if (pageState.status !== 'loaded') return;

      setPageState({
        ...pageState,
        users: pageState.users.map((u) => (u.id === updated.id ? updated : u)),
      });
    } catch {
      // Silently ignore — server error will be visible on next refresh
    }
  }

  if (pageState.status === 'idle' || pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.users.loading', 'Loading users...')} variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.users.title', 'Users')}
          message={pageState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (pageState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.users.title', 'Users')} message={pageState.message} variant="error" />
      </main>
    );
  }

  const { users } = pageState;

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.users.title', 'Users')}
        subtitle={t('admin.users.subtitle', 'Manage organization users and their roles.')}
        action={
          <button className="admin-btn admin-btn--primary" onClick={openCreate} type="button">
            {t('admin.users.createUser', 'Create user')}
          </button>
        }
      />

      <AdminCard>
        {users.length === 0 ? (
          <EmptyState message={t('admin.users.empty', 'No users found.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('admin.users.name', 'Name')}</th>
                <th>{t('admin.users.email', 'Email')}</th>
                <th>{t('admin.users.roles', 'Roles')}</th>
                <th>{t('admin.users.status', 'Status')}</th>
                <th>{t('admin.users.lastLoginAt', 'Last login')}</th>
                <th>{t('admin.users.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{getUserDisplayName(user)}</td>
                  <td>{user.email}</td>
                  <td>{getUserRoles(user)}</td>
                  <td>
                    <StatusBadge tone={getStatusTone(user.status)}>{user.status}</StatusBadge>
                  </td>
                  <td>{formatOptionalDate(user.lastLoginAt, t('admin.users.neverLoggedIn', 'Never'))}</td>
                  <td>
                    <button
                      className={`admin-btn admin-btn--sm ${user.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`}
                      onClick={() => void handleStatusToggle(user)}
                      type="button"
                    >
                      {user.status === 'active'
                        ? t('admin.users.deactivate', 'Deactivate')
                        : t('admin.users.activate', 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      <dialog className="admin-dialog" ref={dialogRef} onClose={closeCreate}>
        <div className="admin-dialog__header">
          <h2>{t('admin.users.createUser', 'Create user')}</h2>
          <button className="admin-dialog__close" onClick={closeCreate} type="button" aria-label={t('common.close', 'Close')}>
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={(e) => void handleCreate(e)}>
          <div className="admin-form__row">
            <div className="admin-form__field">
              <label htmlFor="create-lastName">{t('admin.users.lastName', 'Last name')} *</label>
              <input
                id="create-lastName"
                required
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <div className="admin-form__field">
              <label htmlFor="create-firstName">{t('admin.users.firstName', 'First name')} *</label>
              <input
                id="create-firstName"
                required
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-middleName">{t('admin.users.middleName', 'Middle name')}</label>
            <input
              id="create-middleName"
              type="text"
              value={form.middleName}
              onChange={(e) => setForm({ ...form, middleName: e.target.value })}
            />
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-email">{t('admin.users.email', 'Email')} *</label>
            <input
              id="create-email"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-password">{t('admin.users.password', 'Password')} *</label>
            <input
              id="create-password"
              required
              minLength={8}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-role">{t('admin.users.role', 'Role')}</label>
            <select
              id="create-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole | '' })}
            >
              <option value="">{t('admin.users.noRole', '— No role —')}</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {formState.status === 'error' && (
            <p className="admin-form__error" role="alert">{formState.message}</p>
          )}

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={closeCreate} type="button">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={formState.status === 'submitting'}
              type="submit"
            >
              {formState.status === 'submitting'
                ? t('common.saving', 'Saving...')
                : t('admin.users.createUser', 'Create user')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}
