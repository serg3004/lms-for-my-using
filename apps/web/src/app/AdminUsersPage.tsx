import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import type { FormValidationErrors } from '../shared/formValidation.js';
import { hasValidationErrors } from '../shared/formValidation.js';
import { PageState, Pagination } from '../shared/ui.js';
import { AdminUserDialog } from '../features/admin-users/AdminUserDialog.js';
import { AdminUsersFilters } from '../features/admin-users/AdminUsersFilters.js';
import { AdminUsersTable } from '../features/admin-users/AdminUsersTable.js';
import { EMPTY_USER_FORM, toEditUserForm, withoutPassword, type AdminUserSummary, type UserForm, type UserFormField, type UserFormMode } from '../features/admin-users/model.js';
import { useAdminUserMutations } from '../features/admin-users/useAdminUserMutations.js';
import { useAdminUsers } from '../features/admin-users/useAdminUsers.js';
import { validateUserForm } from '../features/admin-users/validation.js';

const navItems: AdminNavItem[] = [
  { label: 'Admin dashboard', href: '/admin' }, { label: 'Users', href: '/admin/users', isCurrent: true },
];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const usersQuery = useAdminUsers();
  const mutations = useAdminUserMutations(usersQuery.reload);
  const [form, setForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [mode, setMode] = useState<UserFormMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors<UserFormField>>({});

  function open(mode: UserFormMode, user?: AdminUserSummary) {
    setForm(user ? toEditUserForm(user) : { ...EMPTY_USER_FORM });
    setErrors({}); setMessage(null); setMode(mode);
  }
  function close() {
    setForm({ ...EMPTY_USER_FORM });
    setErrors({}); setMessage(null); setMode(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || usersQuery.state.status !== 'loaded') return;
    const nextErrors = validateUserForm(form, mode);
    setErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;
    setMessage(null);
    const result = await mutations.saveUser(form, mode, usersQuery.state.currentUser.organizationId);
    setForm((current) => withoutPassword(current));
    if (result.ok) close();
    else {
      if (result.formErrors) setErrors(result.formErrors);
      setMessage(result.message ?? null);
    }
  }

  if (usersQuery.state.status === 'idle' || usersQuery.state.status === 'loading') return <main className="admin-state"><PageState message="Loading users..." variant="loading" /></main>;
  if (usersQuery.state.status === 'unauthenticated' || usersQuery.state.status === 'error') return <main className="admin-state"><PageState title="Users" message={usersQuery.state.message} variant="error" /></main>;
  if (usersQuery.state.status !== 'loaded') return null;
  const loadedState = usersQuery.state;

  return <AdminPageLayout brandLabel="Admin" sidebarLabel="Admin navigation" navItems={navItems}>
    <AdminPageHeader eyebrow={t('admin.users.eyebrow', 'Access management')} title="Users" subtitle="Manage organization users and their roles." action={<button className="admin-btn admin-btn--primary" onClick={() => open('create')} type="button">Create user</button>} />
    <AdminUsersFilters filters={usersQuery.filters} onChange={usersQuery.setFilters} />
    <AdminUsersTable users={usersQuery.users} onEdit={(user) => open('edit', user)} onToggleStatus={(user) => void mutations.toggleStatus(user)} />
    <Pagination page={usersQuery.page} pageSize={loadedState.pageSize} total={loadedState.total} onPage={usersQuery.setPage} />
    <AdminUserDialog open={mode !== null} mode={mode ?? 'create'} form={form} errors={errors} message={message} isSaving={mutations.isSaving} onChange={setForm} onErrorsChange={setErrors} onSubmit={(event) => void submit(event)} onClose={close} />
  </AdminPageLayout>;
}
