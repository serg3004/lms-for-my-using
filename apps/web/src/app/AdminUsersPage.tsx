import { PendingInvitations } from '../features/admin-users/PendingInvitations.js';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminPageHeader, AdminPageLayout, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import type { FormValidationErrors } from '../shared/formValidation.js';
import { hasValidationErrors } from '../shared/formValidation.js';
import { ApiClientError } from '../shared/apiClient.js';
import { PageState, Pagination } from '../shared/ui.js';
import { DeactivateUserDialog, type PendingDeactivation } from '../features/admin-users/DeactivateUserDialog.js';
import { ArchiveUserDialog, type PendingArchive } from '../features/admin-users/ArchiveUserDialog.js';
import { BulkArchiveDialog, BulkMoveDialog, BulkResultDialog } from '../features/admin-users/BulkDialogs.js';
import { BulkUserBar } from '../features/admin-users/BulkUserBar.js';
import { useBulkUserActions } from '../features/admin-users/useBulkUserActions.js';
import { UserRightsDialog } from '../features/admin-users/UserRightsDialog.js';
import { InvitationResultDialog, ResetPasswordDialogs, TemporaryPasswordDialogs, type InvitationResult, type PasswordResetResult, type TemporaryPasswordResult } from '../features/admin-users/ResetPasswordDialogs.js';
import { AdminUserDialog } from '../features/admin-users/AdminUserDialog.js';
import { AdminUsersFilters } from '../features/admin-users/AdminUsersFilters.js';
import { AdminUsersTable } from '../features/admin-users/AdminUsersTable.js';
import { EMPLOYEE_NUMBER_KEY, EMPTY_USER_FORM, toEditUserForm, userName, withoutPassword, type AdminUserSummary, type UserForm, type UserFormField, type UserFormMode } from '../features/admin-users/model.js';
import { useAdminUserMutations } from '../features/admin-users/useAdminUserMutations.js';
import { useAdminUsers } from '../features/admin-users/useAdminUsers.js';
import { validateUserForm } from '../features/admin-users/validation.js';
import { downloadXlsxFile } from '../shared/downloadCsv.js';
import { exportRows, loadAllUsers } from '../features/admin-users/exportUsers.js';
import { fieldLabel, languageOf, missingRequired } from '../features/user-fields/model.js';
import { useUserFieldViews } from '../features/user-fields/useUserFieldViews.js';

const SHOWN_FIELDS_KEY = 'admin.users.shownFields';
function readShownFields(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SHOWN_FIELDS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const language = languageOf(i18n.language);
  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users', isCurrent: true },
  ];
  const usersQuery = useAdminUsers();
  const mutations = useAdminUserMutations(usersQuery.reload);
  const userFields = useUserFieldViews('users');
  const [shownFields, setShownFields] = useState<string[]>(readShownFields);
  const [exporting, setExporting] = useState(false);
  const bulk = useBulkUserActions({ users: usersQuery.users, filters: usersQuery.filters, resetKey: `${usersQuery.page}|${usersQuery.filters.query}|${usersQuery.filters.role}|${usersQuery.filters.status}|${usersQuery.filters.fieldKey}|${usersQuery.filters.fieldValue}`, reload: usersQuery.reload });
  const [form, setForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [mode, setMode] = useState<UserFormMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors<UserFormField>>({});
  const [pendingDeactivation, setPendingDeactivation] = useState<PendingDeactivation | null>(null);

  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(null);
  const [pendingRestore, setPendingRestore] = useState<AdminUserSummary | null>(null);
  const [archiveFailed, setArchiveFailed] = useState(false);

  const [rightsUser, setRightsUser] = useState<AdminUserSummary | null>(null);
  const [pendingReset, setPendingReset] = useState<AdminUserSummary | null>(null);
  const [resetResult, setResetResult] = useState<PasswordResetResult | null>(null);
  const [inviteResult, setInviteResult] = useState<InvitationResult | null>(null);
  const [pendingTemporary, setPendingTemporary] = useState<AdminUserSummary | null>(null);
  const [temporaryResult, setTemporaryResult] = useState<TemporaryPasswordResult | null>(null);

  async function confirmReset() {
    const user = pendingReset;
    setPendingReset(null);
    if (!user) return;
    try {
      setResetResult({ user, ...(await mutations.resetPassword(user)) });
    } catch (error) {
      setResetResult({ user, error: error instanceof ApiClientError ? error.message : t('admin.users.resetPasswordFailed', 'Could not reset the password. Try again.') });
    }
  }

  async function confirmTemporary() {
    const user = pendingTemporary;
    setPendingTemporary(null);
    if (!user) return;
    try {
      setTemporaryResult({ user, ...(await mutations.issueTemporaryPassword(user)) });
    } catch {
      setTemporaryResult({ user, error: t('security.tempError') });
    }
  }

  function open(mode: UserFormMode, user?: AdminUserSummary) {
    setForm(user ? toEditUserForm(user) : { ...EMPTY_USER_FORM });
    setErrors({}); setMessage(null); setMode(mode);
  }
  function close() {
    setForm({ ...EMPTY_USER_FORM });
    setErrors({}); setMessage(null); setMode(null);
  }
  async function toggleStatus(user: AdminUserSummary) {
    if (user.status !== 'active') return mutations.toggleStatus(user);
    setPendingDeactivation({ user, observerSessions: await mutations.loadObserverSessions(user) });
  }
  async function confirmDeactivation() {
    const pending = pendingDeactivation;
    setPendingDeactivation(null);
    if (pending) await mutations.toggleStatus(pending.user);
  }
  async function startArchive(user: AdminUserSummary) {
    setArchiveFailed(false);
    setPendingArchive({ user, impact: await mutations.loadImpact(user) });
  }
  async function confirmArchive() {
    const pending = pendingArchive;
    if (!pending) return;
    if (await mutations.setStatus(pending.user, 'archived')) setPendingArchive(null);
    else setArchiveFailed(true);
  }
  async function confirmRestore() {
    const user = pendingRestore;
    setPendingRestore(null);
    if (user && !(await mutations.setStatus(user, 'active'))) setMessage(t('security.restoreError'));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || usersQuery.state.status !== 'loaded') return;
    const nextErrors = validateUserForm(form, mode, t);
    setErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;
    if (mode === 'create' && form.noEmail && !(form.customFields?.[EMPLOYEE_NUMBER_KEY] ?? '').trim()) { setMessage(t('identity.admin.employeeNumberRequired')); return; }
    const missing = missingRequired(userFields.fields, form.customFields, language);
    if (missing.length > 0) { setMessage(t('userFields.requiredMissing', { fields: missing.join(', ') })); return; }
    setMessage(null);
    const result = await mutations.saveUser(form, mode, usersQuery.state.currentUser.organizationId, userFields.fields);
    setForm((current) => withoutPassword(current));
    if (result.ok) { close(); setInviteResult(result.invitation ?? null); setTemporaryResult(result.temporary ?? null); }
    else {
      if (result.formErrors) setErrors(result.formErrors);
      setMessage(result.message ?? null);
    }
  }

  if (usersQuery.state.status === 'loading') return <main className="admin-state"><PageState message={t('admin.users.loading', 'Loading users...')} variant="loading" /></main>;
  if (usersQuery.state.status === 'unauthenticated' || usersQuery.state.status === 'error') return <main className="admin-state"><PageState title={t('admin.users.title', 'Users')} message={usersQuery.state.message} variant="error" /></main>;
  if (usersQuery.state.status !== 'loaded') return null;
  const loadedState = usersQuery.state;
  const canArchive = loadedState.currentUser.roles.includes('admin');
  const columnFields = userFields.fields.filter((field) => shownFields.includes(field.key));
  function toggleField(key: string) {
    const next = shownFields.includes(key) ? shownFields.filter((item) => item !== key) : [...shownFields, key];
    setShownFields(next);
    try { localStorage.setItem(SHOWN_FIELDS_KEY, JSON.stringify(next)); } catch { /* a remembered choice is a convenience only */ }
  }
  async function exportExcel() {
    setExporting(true);
    setMessage(null);
    try {
      const users = await loadAllUsers(usersQuery.filters);
      const rows = exportRows(users, columnFields, language, {
        name: t('admin.users.col.name', 'Name'), email: t('admin.users.col.email', 'Email'), role: t('admin.users.col.role', 'Role'), status: t('admin.users.col.status', 'Status'),
        yes: t('userFields.yes'), no: t('userFields.no'), roleLabel: (role) => t(`admin.roles.options.${role}`, role), statusLabel: (status) => t(`admin.users.status.${status}`, status),
      });
      await downloadXlsxFile(`${t('userFields.exportFile')}.xlsx`, rows, t('userFields.exportFile'), { styled: true });
    } catch {
      setMessage(t('userFields.exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
    <AdminPageHeader
      eyebrow={t('admin.users.eyebrow', 'Access management')}
      title={t('admin.users.title', 'Users')}
      subtitle={t('admin.users.subtitle', 'Manage organization users and their roles.')}
      action={<div className="td-actions"><a className="admin-btn admin-btn--secondary" href="/admin/user-fields">{t('userFields.settingsLink')}</a><a className="admin-btn admin-btn--secondary" href="/admin/users/import">{t('usersImport.button')}</a><button className="admin-btn admin-btn--primary" onClick={() => open('create')} type="button">{t('admin.users.createButton', 'Create user')}</button></div>}
    />
    <PendingInvitations />
    <AdminUsersFilters filters={usersQuery.filters} onChange={usersQuery.setFilters} fields={userFields.fields} />
    <div className="td-actions">
      {userFields.fields.length > 0 ? <details><summary>{t('userFields.columns')}</summary><div style={{ display: 'grid', gap: '0.25rem', padding: '0.5rem 0' }}>{userFields.fields.map((field) => <label key={field.key}><input type="checkbox" checked={shownFields.includes(field.key)} onChange={() => toggleField(field.key)} /> {fieldLabel(field, language)}</label>)}</div></details> : null}
      <button className="admin-btn admin-btn--secondary" disabled={exporting} onClick={() => void exportExcel()} type="button">{exporting ? t('userFields.exporting') : t('userFields.exportExcel')}</button>
    </div>
    {message && mode === null ? <p className="admin-form__error" role="alert">{message}</p> : null}
    <AdminUsersTable extraFields={columnFields} selection={{ selectedKeys: bulk.selectedKeys, onChange: bulk.setSelectedKeys, selectedLabel: (count) => t('common.selectedCount', { count }), selectAllLabel: t('security.bulkSelectAllRows'), rowLabel: (user) => userName(user) }} batchActions={<BulkUserBar scope={bulk.scope} canArchive={canArchive} canSelectAll={bulk.canSelectAll} matching={bulk.matching} busy={bulk.busy} onAction={(action) => void bulk.start(action)} onSelectAll={bulk.selectAllMatching} onClear={bulk.clear} />} users={usersQuery.users} onEdit={(user) => open('edit', user)} onToggleStatus={(user) => void toggleStatus(user)} onResetPassword={setPendingReset} onTemporaryPassword={setPendingTemporary} onRights={setRightsUser} onArchive={canArchive ? (user) => void startArchive(user) : undefined} onRestore={canArchive ? setPendingRestore : undefined} />
    <BulkArchiveDialog pending={bulk.pendingArchive} error={bulk.error} onCancel={bulk.cancelArchive} onConfirm={() => void bulk.confirmArchive()} />
    {bulk.moveOpen ? <BulkMoveDialog open count={bulk.count} busy={bulk.busy} error={bulk.error} onCancel={bulk.cancelMove} onConfirm={(id) => void bulk.confirmMove(id)} /> : null}
    <BulkResultDialog report={bulk.report} names={bulk.names} onClose={bulk.closeReport} />
    {rightsUser ? <UserRightsDialog user={rightsUser} onClose={() => setRightsUser(null)} /> : null}
    <InvitationResultDialog result={inviteResult} onClose={() => setInviteResult(null)} />
    <ResetPasswordDialogs pending={pendingReset} result={resetResult} onConfirm={() => void confirmReset()} onCancel={() => setPendingReset(null)} onClose={() => setResetResult(null)} />
    <TemporaryPasswordDialogs pending={pendingTemporary} result={temporaryResult} onConfirm={() => void confirmTemporary()} onCancel={() => setPendingTemporary(null)} onClose={() => setTemporaryResult(null)} />
    <DeactivateUserDialog pending={pendingDeactivation} onCancel={() => setPendingDeactivation(null)} onConfirm={() => void confirmDeactivation()} />
    <ArchiveUserDialog pending={pendingArchive} error={archiveFailed} onCancel={() => setPendingArchive(null)} onConfirm={() => void confirmArchive()} />
    <ConfirmDialog open={pendingRestore !== null} title={t('security.restoreTitle')} message={pendingRestore ? t('security.restoreIntro', { name: userName(pendingRestore) }) : ''} confirmLabel={t('security.restoreAction')} cancelLabel={t('admin.users.cancel', 'Cancel')} onCancel={() => setPendingRestore(null)} onConfirm={() => void confirmRestore()} />
    <Pagination page={usersQuery.page} pageSize={loadedState.pageSize} total={loadedState.total} onPage={usersQuery.setPage} />
    <AdminUserDialog fields={userFields.fields} open={mode !== null} mode={mode ?? 'create'} form={form} errors={errors} message={message} isSaving={mutations.isSaving} onChange={setForm} onErrorsChange={setErrors} onSubmit={(event) => void submit(event)} onClose={close} />
  </AdminPageLayout>;
}
