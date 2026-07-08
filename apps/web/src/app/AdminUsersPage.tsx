import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { getCurrentUser } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
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

type UserForm = {
  id?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName: string;
  position: string;
  shift: string;
  phone: string;
  status: UserStatus;
  locale: string;
  timezone: string;
  role: UserRole | '';
};

const EMPTY_FORM: UserForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  middleName: '',
  position: '',
  shift: '',
  phone: '',
  status: 'active',
  locale: 'ru',
  timezone: 'Asia/Almaty',
  role: '',
};

type UserFormField = 'firstName' | 'lastName' | 'email' | 'password';

const ROLES: UserRole[] = ['learner', 'instructor', 'manager', 'admin'];
const STATUSES: UserStatus[] = ['active', 'invited', 'suspended', 'archived'];

function userName(user: AdminUserSummary) {
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || user.email;
}

function userRole(user: AdminUserSummary): UserRole | '' {
  return user.memberships[0]?.role ?? '';
}

function editForm(user: AdminUserSummary): UserForm {
  return {
    id: user.id,
    email: user.email,
    password: '',
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName ?? '',
    position: user.position ?? '',
    shift: user.shift ?? '',
    phone: user.phone ?? '',
    status: user.status,
    locale: user.locale,
    timezone: user.timezone,
    role: userRole(user),
  };
}

export function AdminUsersPage() {
  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<FormValidationErrors<UserFormField>>({});

  const navItems: AdminNavItem[] = [
    { label: 'Admin dashboard', href: '/admin' },
    { label: 'Users', href: '/admin/users', isCurrent: true },
  ];

  const loadData = useCallback(async () => {
    setPageState({ status: 'loading' });

    try {
      const [users, currentUser] = await Promise.all([
        apiRequest<AdminUserSummary[]>('/users'),
        getCurrentUser(),
      ]);

      setPageState({ status: 'loaded', users, currentUser });
    } catch (loadError) {
      if (loadError instanceof ApiClientError && loadError.status === 401) {
        setPageState({ status: 'unauthenticated', message: 'Your session expired. Sign in again.' });
        return;
      }

      setPageState({ status: 'error', message: 'Unable to load users. Try again later.' });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setValidationErrors({});
    setMode('create');
  }

  function openEdit(user: AdminUserSummary) {
    setForm(editForm(user));
    setError(null);
    setValidationErrors({});
    setMode('edit');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (pageState.status !== 'loaded' || !mode) return;

    const requiredFields: Array<{ name: UserFormField; value: string; message: string }> = [
      { name: 'lastName', value: form.lastName, message: 'Last name is required' },
      { name: 'firstName', value: form.firstName, message: 'First name is required' },
      { name: 'email', value: form.email, message: 'Email is required' },
    ];
    if (mode === 'create') {
      requiredFields.push({ name: 'password', value: form.password, message: 'Password is required' });
    }
    const nextErrors = validateRequiredFields(requiredFields);
    setValidationErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;

    setIsSaving(true);
    setError(null);

    try {
      if (mode === 'create') {
        const created = await apiRequest<AdminUserSummary>('/users', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: pageState.currentUser.organizationId,
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
              organizationId: pageState.currentUser.organizationId,
              userId: created.id,
              role: form.role,
            }),
          });
        }

        await loadData();
      } else if (form.id) {
        const updated = await apiRequest<AdminUserSummary>(`/users/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            middleName: form.middleName || undefined,
            position: form.position || undefined,
            shift: form.shift || undefined,
            phone: form.phone || undefined,
            status: form.status,
            locale: form.locale,
            timezone: form.timezone,
            role: form.role || null,
          }),
        });

        setPageState({
          ...pageState,
          users: pageState.users.map((user) => (user.id === updated.id ? updated : user)),
        });
      }

      setMode(null);
    } catch (saveError) {
      setError(saveError instanceof ApiClientError ? saveError.message : 'Failed to save user. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(user: AdminUserSummary) {
    const status = user.status === 'active' ? 'suspended' : 'active';

    try {
      const updated = await apiRequest<AdminUserSummary>(`/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      if (pageState.status !== 'loaded') return;

      setPageState({
        ...pageState,
        users: pageState.users.map((item) => (item.id === updated.id ? updated : item)),
      });
    } catch {
      await loadData();
    }
  }

  if (pageState.status === 'idle' || pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message="Loading users..." variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated' || pageState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title="Users" message={pageState.message} variant="error" />
      </main>
    );
  }

  return (
    <AdminPageLayout brandLabel="Admin" sidebarLabel="Admin navigation" navItems={navItems}>
      <AdminPageHeader
        title="Users"
        subtitle="Manage organization users and their roles."
        action={
          <button className="admin-btn admin-btn--primary" onClick={openCreate} type="button">
            Create user
          </button>
        }
      />

      <AdminCard>
        {pageState.users.length === 0 ? (
          <EmptyState message="No users found." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageState.users.map((user) => (
                <tr key={user.id}>
                  <td>{userName(user)}</td>
                  <td>{user.email}</td>
                  <td>{user.memberships.map((membership) => membership.role).join(', ') || '—'}</td>
                  <td>
                    <StatusBadge tone={user.status === 'active' ? 'success' : 'neutral'}>{user.status}</StatusBadge>
                  </td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td>
                    <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => openEdit(user)} type="button">
                      Edit
                    </button>{' '}
                    <button
                      className={`admin-btn admin-btn--sm ${user.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`}
                      onClick={() => void toggleStatus(user)}
                      type="button"
                    >
                      {user.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      {mode && (
        <AdminCard>
          <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
            <h2>{mode === 'create' ? 'Create user' : 'Edit user'}</h2>

            <div className="admin-form__row">
              <div className="admin-form__field">
                <label htmlFor="user-lastName">Last name *</label>
                <input
                  id="user-lastName"
                  aria-describedby={validationErrors.lastName ? 'user-lastName-error' : undefined}
                  aria-invalid={Boolean(validationErrors.lastName)}
                  value={form.lastName}
                  onChange={(event) => {
                    setForm({ ...form, lastName: event.target.value });
                    setValidationErrors((e) => clearFieldError(e, 'lastName'));
                  }}
                />
                {validationErrors.lastName ? (
                  <p className="admin-form__field-error" id="user-lastName-error" role="alert">{validationErrors.lastName}</p>
                ) : null}
              </div>
              <div className="admin-form__field">
                <label htmlFor="user-firstName">First name *</label>
                <input
                  id="user-firstName"
                  aria-describedby={validationErrors.firstName ? 'user-firstName-error' : undefined}
                  aria-invalid={Boolean(validationErrors.firstName)}
                  value={form.firstName}
                  onChange={(event) => {
                    setForm({ ...form, firstName: event.target.value });
                    setValidationErrors((e) => clearFieldError(e, 'firstName'));
                  }}
                />
                {validationErrors.firstName ? (
                  <p className="admin-form__field-error" id="user-firstName-error" role="alert">{validationErrors.firstName}</p>
                ) : null}
              </div>
              <div className="admin-form__field">
                <label htmlFor="user-middleName">Middle name</label>
                <input
                  id="user-middleName"
                  value={form.middleName}
                  onChange={(event) => setForm({ ...form, middleName: event.target.value })}
                />
              </div>
            </div>

            <div className="admin-form__field">
              <label htmlFor="user-email">Email *</label>
              <input
                id="user-email"
                type="email"
                aria-describedby={validationErrors.email ? 'user-email-error' : undefined}
                aria-invalid={Boolean(validationErrors.email)}
                value={form.email}
                onChange={(event) => {
                  setForm({ ...form, email: event.target.value });
                  setValidationErrors((e) => clearFieldError(e, 'email'));
                }}
              />
              {validationErrors.email ? (
                <p className="admin-form__field-error" id="user-email-error" role="alert">{validationErrors.email}</p>
              ) : null}
            </div>

            {mode === 'create' && (
              <div className="admin-form__field">
                <label htmlFor="user-password">Password *</label>
                <input
                  id="user-password"
                  type="password"
                  minLength={8}
                  aria-describedby={validationErrors.password ? 'user-password-error' : undefined}
                  aria-invalid={Boolean(validationErrors.password)}
                  value={form.password}
                  onChange={(event) => {
                    setForm({ ...form, password: event.target.value });
                    setValidationErrors((e) => clearFieldError(e, 'password'));
                  }}
                />
                {validationErrors.password ? (
                  <p className="admin-form__field-error" id="user-password-error" role="alert">{validationErrors.password}</p>
                ) : null}
              </div>
            )}

            {mode === 'edit' && (
              <>
                <div className="admin-form__row">
                  <label>
                    Position
                    <input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
                  </label>
                  <label>
                    Shift
                    <input value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} />
                  </label>
                  <label>
                    Phone
                    <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </label>
                </div>

                <div className="admin-form__row">
                  <label>
                    Status
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Locale
                    <input required value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })} />
                  </label>
                  <label>
                    Timezone
                    <input required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
                  </label>
                </div>
              </>
            )}

            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole | '' })}>
                <option value="">— No role —</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>

            {error && <p className="admin-form__error" role="alert">{error}</p>}

            <div className="admin-form__actions">
              <button className="admin-btn admin-btn--secondary" onClick={() => setMode(null)} type="button">
                Cancel
              </button>
              <button className="admin-btn admin-btn--primary" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
