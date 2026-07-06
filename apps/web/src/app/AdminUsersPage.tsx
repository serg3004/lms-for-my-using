import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';
type UserStatus = 'active' | 'invited' | 'suspended' | 'archived';

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
  status: UserStatus;
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

type FormState = { status: 'idle' } | { status: 'submitting' } | { status: 'error'; message: string };

type CreateFormFields = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  password: string;
  role: UserRole | '';
};

type EditFormFields = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string;
  position: string;
  shift: string;
  phone: string;
  email: string;
  status: UserStatus;
  locale: string;
  timezone: string;
  role: UserRole | '';
};

type UserNameFields = Pick<EditFormFields, 'firstName' | 'lastName' | 'middleName'>;

const EMPTY_CREATE_FORM: CreateFormFields = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  password: '',
  role: '',
};

const USER_ROLES: UserRole[] = ['learner', 'instructor', 'manager', 'admin'];
const USER_STATUSES: UserStatus[] = ['active', 'invited', 'suspended', 'archived'];

function getUserDisplayName(user: AdminUserSummary) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

  return fullName || user.email;
}

function formatOptionalDate(value: string | null, fallback: string) {
  if (!value) return fallback;

  return new Date(value).toLocaleString();
}

function getStatusTone(status: UserStatus) {
  return status === 'active' ? 'success' : 'neutral';
}

function getUserRole(user: AdminUserSummary): UserRole | '' {
  return user.memberships[0]?.role ?? '';
}

function getUserRoles(user: AdminUserSummary): string {
  if (user.memberships.length === 0) return '—';

  return user.memberships.map((m) => m.role).join(', ');
}

function createEditForm(user: AdminUserSummary): EditFormFields {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName ?? '',
    position: user.position ?? '',
    shift: user.shift ?? '',
    phone: user.phone ?? '',
    email: user.email,
    status: user.status,
    locale: user.locale,
    timezone: user.timezone,
    role: getUserRole(user),
  };
}

function UserNameFields({
  form,
  onChange,
}: {
  form: UserNameFields;
  onChange: (fields: Partial<UserNameFields>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="admin-form__row">
      <div className="admin-form__field">
        <label htmlFor="user-lastName">{t('admin.users.lastName', 'Last name')} *</label>
        <input
          id="user-lastName"
          required
          type="text"
          value={form.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
        />
      </div>
      <div className="admin-form__field">
        <label htmlFor="user-firstName">{t('admin.users.firstName', 'First name')} *</label>
        <input
          id="user-firstName"
          required
          type="text"
          value={form.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
        />
      </div>
      <div className="admin-form__field">
        <label htmlFor="user-middleName">{t('admin.users.middleName', 'Middle name')}</label>
        <input
          id="user-middleName"
          type="text"
          value={form.middleName}
          onChange={(e) => onChange({ middleName: e.target.value })}
        />
      </div>
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: UserRole | '';
  onChange: (role: UserRole | '') => void;
}) {
  const { t } = useTranslation();

  return (
    <select id="user-role" value={value} onChange={(e) => onChange(e.target.value as UserRole | '')}>
      <option value="">{t('admin.users.noRole', '— No role —')}</option>
      {USER_ROLES.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormFields>(EMPTY_CREATE_FORM);
  const [createFormState, setCreateFormState] = useState<FormState>({ status: 'idle' });
  const [editForm, setEditForm] = useState<EditFormFields | null>(null);
  const [editFormState, setEditFormState] = useState<FormState>({ status: 'idle' });
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);

  const narItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users', isCurrent: true },
  ];

  const loadData = useCallback(async () => {
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
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (showCreate) {
      createDialogRef.current?.showModal();
    } else {
      createDialogRef.current?.close();
    }
  }, [showCreate]);

  useEffect(() => {
    if (editForm) {
      editDialogRef.current?.showModal();
    } else {
      editDialogRef.current?.close();
    }
  }, [editForm]);

  function openCreate() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateFormState({ status: 'idle' });
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
  }

  function openEdit(user: AdminUserSummary) {
    setEditForm(createEditForm(user));
    setEditFormState({ status: 'idle' });
  }

  function closeEdit() {
    setEditForm(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();

    if (pageState.status !== 'loaded') return;

    setCreateFormState({ status: 'submitting' });

    const { organizationId } = pageState.currentUser;

    try {
      const created = await apiRequest<AdminUserSummary>('/users', {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          email: createForm.email,
          password: createForm.password,
          firstName: createForm.firstName,
          lastName: createForm.lastName,
          middleName: createForm.middleName || undefined,
        }),
      });

      if (createForm.role) {
        await apiRequest('/memberships', {
          method: 'POST',
          body: JSON.stringify({
            organizationId,
            userId: created.id,
            role: createForm.role,
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

      setCreateFormState({ status: 'error', message });
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();

    if (!editForm || pageState.status !== 'loaded') return;

    setEditFormState({ status: 'submitting' });

    try {
      const updated = await apiRequest<AdminUserSummary>(`/users/${editForm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: editForm.email,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          middleName: editForm.middleName || undefined,
          position: editForm.position || undefined,
          shift: editForm.shift || undefined,
          phone: editForm.phone || undefined,
          status: editForm.status,
          locale: editForm.locale,
          timezone: editForm.timezone,
          role: editForm.role || null,
        }),
      });

      setPageState({
        ...pageState,
        users: pageState.users.map((user) => (user.id === updated.id ? updated : user)),
      });
      closeEdit();
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : t('admin.users.updateError', 'Failed to update user. Try again.');

      setEditFormState({ status: 'error', message });
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
                    <div className="admin-actions">
                      <button
                        className="admin-btn admin-btn--sm admin-btn--secondary"
                        onClick={() => openEdit(user)}
                        type="button"
                      >
                        {t('common.edit', 'Edit')}
                      </button>
                      <button
                        className={`admin-btn admin-btn--sm ${
                          user.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'
                        }`}
                        onClick={() => void handleStatusToggle(user)}
                        type="button"
                      >
                       {user.status === 'active'
                        ? t('admin.users.deactivate', 'Deactivate')
                        : t('admin.users.activate', 'Activate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      <dialog className="admin-dialog" ref={createDialogRef} onClose={closeCreate}>
        <div className="admin-dialog__header">
          <h2>{t('admin.users.createUser', 'Create user')}</h2>
          <button className="admin-dialog__close" onClick={closeCreate} type="button" aria-label={t('common.close', 'Close')}>
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={(e) => void handleCreate(e)}>
          <UserNameFields
            form={createForm}
            onChange={(fields) => setCreateForm({ ...createForm, ...fields })}
          />

          <div className="admin-form__field">
            <label htmlFor="create-email">{t('admin.users.email', 'Email')} *</label>
            <input
              id="create-email"
              required
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-password">{t('admin.users.password', 'Password')} *</label>
            <input
              id="create-password"
              required
              minLength={8}
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-role">{t('admin.users.role', 'Role')}</label>
            <RoleSelect value={createForm.role} onChange={(role) => setCreateForm({ ...createForm, role })} />
          </div>

          {createFormState.status === 'error' && (
            <p className="admin-form__error" role="alert">{createFormState.message}</p>
          )}

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={closeCreate} type="button">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={createFormState.status === 'submitting'}
              type="submit"
            >
              {createFormState.status === 'submitting'
                ? t('common.saving', 'Saving...')
                : t('admin.users.createUser', 'Create user')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="admin-dialog" ref={editDialogRef} onClose={closeEdit}>
        <div className="admin-dialog__header">
          <h2>{t('admin.users.editUser', 'Edit user')}</h2>
          <button className="admin-dialog__close" onClick={closeEdit} type="button" aria-label={t('common.close', 'Close')}>
            ✕
          </button>
        </div>

        {editForm && (
          <form className="admin-form" onSubmit={(e) => void handleEdit(e)}>
            <UserNameFields form={editForm} onChange={(fields) => setEditForm({ ...editForm, ...fields })} />

            <div className="admin-form__field">
              <label htmlFor="edit-email">{t('admin.users.email', 'Email')} *</label>
              <input
                id="edit-email"
                required
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>

            <div className="admin-form__row">
              <div className="admin-form__field">
                <label htmlFor="edit-position">{t('admin.users.position', 'Position')}</label>
                <input
                  id="edit-position"
                  type="text"
                  value={editForm.position}
                  onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                />
              </div>
              <div className="admin-form__field">
                <label htmlFor="edit-shift">{t('admin.users.shift', 'Shift')}</label>
                <input
                  id="edit-shift"
                  type="text"
                  value={editForm.shift}
                  onChange={(e) => setEditForm({ ...editForm, shift: e.target.value })}
                />
              </div>
            </div>

            <div className="admin-form__field">
              <label htmlFor="edit-phone">{t('admin.users.phone', 'Phone')}</label>
              <input
                id="edit-phone"
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>

            <div className="admin-form__row">
              <div className="admin-form__field">
                <label htmlFor="edit-status">{t('admin.users.status', 'Status')}</label>
                <select
                  id="edit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserStatus })}
                >
                  {USER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-form__field">
                <label htmlFor="edit-role">{t('admin.users.role', 'Role')}</label>
                <RoleSelect value={editForm.role} onChange={(role) => setEditForm({ ...editForm, role })} />
              </div>
            </div>

            <div className="admin-form__row">
              <div className="admin-form__field">
                <label htmlFor="edit-locale">{t('admin.users.locale', 'Locale')}</label>
                <input
                  id="edit-locale"
                  required
                  type="text"
                  value={editForm.locale}
                  onChange={(e) => setEditForm({ ...editForm, locale: e.target.value })}
                />
              </div>
              <div className="admin-form__field">
                <label htmlFor="edit-timezone">{t('admin.users.timezone', 'Timezone')}</label>
                <input
                  id="edit-timezone"
                  required
                  type="text"
                  value={editForm.timezone}
                  onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                />
              </div>
            </div>

            {editFormState.status === 'error' && (
              <p className="admin-form__error" role="alert">{editFormState.message}</p>
            )}

            <div className="admin-form__actions">
              <button className="admin-btn admin-btn--secondary" onClick={closeEdit} type="button">
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="admin-btn admin-btn--primary"
                disabled={editFormState.status === 'submitting'}
                type="submit"
              >
                {editFormState.status === 'submitting'
                  ? t('common.saving', 'Saving...')
                  : t('common.save', 'Save')}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </AdminPageLayout>
  );
}
