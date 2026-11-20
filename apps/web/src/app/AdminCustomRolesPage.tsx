import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import type { PaginatedResponse } from '../shared/api/types.js';
import { archiveCustomRole, createCustomRole, listCustomRoles, listRoleAssignments, updateCustomRole, type CustomRole, type RoleAssignment } from '../shared/api/customRoles.js';
import { AdminPageHeader, AdminPageLayout, AdminSectionCard, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import { CustomRolesSwitch } from '../features/admin-custom-roles/CustomRolesSwitch.js';
import { RoleAssignments, type PickableUser } from '../features/admin-custom-roles/RoleAssignments.js';
import { RoleEditor } from '../features/admin-custom-roles/RoleEditor.js';
import { EMPTY_ROLE_FORM, formFromRole, formsEqual, hasRoleFormErrors, validateRoleForm, type RoleForm, type RoleFormErrors } from '../features/admin-custom-roles/model.js';

type Selection = { kind: 'none' } | { kind: 'new'; basedOnRoleId?: string } | { kind: 'role'; id: string };
type PageData = { forbidden: boolean; roles: CustomRole[]; users: PickableUser[] };
type Banner = { kind: 'conflict' | 'error' | 'ok'; text: string } | null;
type UserRow = { id: string; firstName: string; lastName: string; email: string };

async function loadPage(): Promise<PageData> {
  try {
    const [roles, users] = await Promise.all([listCustomRoles(), apiRequest<PaginatedResponse<UserRow>>('/users?pageSize=200')]);
    return { forbidden: false, roles, users: users.items.map((user) => ({ id: user.id, label: `${`${user.lastName} ${user.firstName}`.trim()} · ${user.email}` })) };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 403) return { forbidden: true, roles: [], users: [] };
    throw error;
  }
}

/** PR 485: "Roles and permissions" — list, editor, copy, archive and assignment of custom roles (administrator). */
export function AdminCustomRolesPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const navItems: AdminNavItem[] = [{ label: t('customRoles.title', 'Roles and permissions'), href: '/admin/custom-roles', isCurrent: true }];
  const { state, reload, refresh } = useAsyncData<PageData>(loadPage, [t], {
    unauthenticated: t('customRoles.sessionExpired', 'Your session expired. Sign in again.'),
    error: t('customRoles.loadError', 'Unable to load roles. Try again later.'),
  });
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [form, setForm] = useState<RoleForm>(EMPTY_ROLE_FORM);
  const [baseline, setBaseline] = useState<RoleForm>(EMPTY_ROLE_FORM);
  const [errors, setErrors] = useState<RoleFormErrors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [pending, setPending] = useState<Selection | null>(null);
  const [archiving, setArchiving] = useState(false);
  const takeServerVersion = useRef(false);

  const roles = state.status === 'loaded' ? state.data.roles : [];
  const selected = selection.kind === 'role' ? roles.find((role) => role.id === selection.id) ?? null : null;
  const dirty = selection.kind !== 'none' && !formsEqual(form, baseline);
  const readOnly = selected?.state === 'archived';

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loadAssignments = useCallback(async (id: string) => {
    try { setAssignments(await listRoleAssignments(id)); } catch { setAssignments([]); }
  }, []);
  useEffect(() => { if (selection.kind === 'role') void loadAssignments(selection.id); else setAssignments([]); }, [selection, loadAssignments]);

  function open(next: Selection, source: CustomRole[] = roles) {
    const role = next.kind === 'role' ? source.find((item) => item.id === next.id) : undefined;
    const based = next.kind === 'new' && next.basedOnRoleId ? source.find((item) => item.id === next.basedOnRoleId) : undefined;
    const nextForm = role ? formFromRole(role)
      : based ? { ...formFromRole(based), name: t('customRoles.copyName', '{{name}} (copy)', { name: based.name }) }
        : EMPTY_ROLE_FORM;
    setSelection(next); setForm(nextForm); setBaseline(based ? { ...nextForm, name: '' } : nextForm); setErrors({}); setBanner(null);
  }
  function choose(next: Selection) {
    if (dirty) setPending(next); else open(next);
  }

  async function save() {
    const found = validateRoleForm(form);
    setErrors(found);
    if (hasRoleFormErrors(found) || selection.kind === 'none' || saving) return;
    setSaving(true); setBanner(null);
    const description = form.description.trim() || null;
    try {
      const saved = selection.kind === 'new'
        ? await createCustomRole({ name: form.name.trim(), description, permissions: form.grants, ...(selection.basedOnRoleId ? { basedOnRoleId: selection.basedOnRoleId } : {}) })
        : await updateCustomRole(selection.id, { version: selected?.version ?? 1, name: form.name.trim(), description, permissions: form.grants });
      await refresh();
      setSelection({ kind: 'role', id: saved.id }); const next = formFromRole(saved); setForm(next); setBaseline(next);
      setBanner({ kind: 'ok', text: t('customRoles.saved', 'Role saved.') });
    } catch (error) {
      setBanner(describeFailure(error));
    } finally { setSaving(false); }
  }

  function describeFailure(error: unknown): Banner {
    if (error instanceof ApiClientError) {
      if (error.status === 409 && /name/i.test(error.message)) return { kind: 'error', text: t('customRoles.nameTaken', 'A role with this name already exists.') };
      if (error.status === 409) return { kind: 'conflict', text: t('customRoles.conflict', 'Someone else changed this role. Reload it to see the current version; your edits here are not saved.') };
      if (error.status === 404) return { kind: 'conflict', text: t('customRoles.roleNotFound', 'The role no longer exists. Reload the list.') };
      if (error.status === 403) return { kind: 'error', text: t('customRoles.forbidden', 'Only an administrator can manage roles.') };
      if (error.status === 422) return { kind: 'error', text: t('customRoles.invalid', 'The server refused the set of rights. Check the rights and their dependencies.') };
    }
    return { kind: 'error', text: t('customRoles.saveFailed', 'Could not save the role. Try again.') };
  }

  async function reloadSelected() {
    setBanner(null);
    takeServerVersion.current = true; // the conflict note promised the edits are dropped: show the server's version
    await reload();
  }
  useEffect(() => {
    // After a reload (the conflict button) take the server's version of the open role.
    if (state.status === 'loaded' && selection.kind === 'role') {
      const role = state.data.roles.find((item) => item.id === selection.id);
      if (role && (takeServerVersion.current || !dirty)) { const next = formFromRole(role); setForm(next); setBaseline(next); }
      takeServerVersion.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function archive() {
    if (!selected) return;
    setArchiving(false); setSaving(true); setBanner(null);
    try {
      await archiveCustomRole(selected.id, selected.version);
      await refresh();
      setBanner({ kind: 'ok', text: t('customRoles.archived', 'Role archived: its assignments stop working from the next request.') });
    } catch (error) { setBanner(describeFailure(error)); } finally { setSaving(false); }
  }

  const users = useMemo(() => (state.status === 'loaded' ? state.data.users : []), [state]);

  if (state.status === 'loading') return <main className="admin-state"><PageState message={t('customRoles.loading', 'Loading roles...')} variant="loading" /></main>;
  if (state.status !== 'loaded') return <main className="admin-state"><PageState title={t('customRoles.title', 'Roles and permissions')} message={state.message} variant="error" /></main>;
  if (state.data.forbidden) return <main className="admin-state"><PageState title={t('customRoles.title', 'Roles and permissions')} message={t('customRoles.forbidden', 'Only an administrator can manage roles.')} variant="error" /></main>;

  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
    <AdminPageHeader
      eyebrow={t('customRoles.eyebrow', 'Access control')}
      title={t('customRoles.title', 'Roles and permissions')}
      subtitle={t('customRoles.subtitle', 'Create roles with their own set of rights and assign them to users.')}
      action={<button className="admin-btn admin-btn--primary" onClick={() => choose({ kind: 'new' })} type="button">{t('customRoles.create', 'Create role')}</button>}
    />
    {currentUser ? <CustomRolesSwitch organizationId={currentUser.organizationId} /> : null}
    <div className="admin-content-grid" style={{ marginTop: 16 }}>
      <AdminSectionCard title={t('customRoles.listTitle', 'Roles')}>
        {roles.length === 0 ? <EmptyState title={t('customRoles.emptyTitle', 'No roles yet')} message={t('customRoles.empty', 'Create the first role: choose its rights and who gets it.')} /> : <ul className="admin-membership-list" style={{ margin: 0 }}>
          {roles.map((role) => <li key={role.id}>
            <button aria-current={selection.kind === 'role' && selection.id === role.id ? 'true' : undefined} className="admin-btn admin-btn--secondary" onClick={() => choose({ kind: 'role', id: role.id })} style={{ flex: '1 1 auto', justifyContent: 'flex-start', textAlign: 'left', minWidth: 0 }} type="button">
              {role.name}
            </button>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <StatusBadge tone={role.state === 'active' ? 'success' : 'neutral'}>{role.state === 'active' ? t('customRoles.stateActive', 'Active') : t('customRoles.stateArchived', 'Archived')}</StatusBadge>
              <span title={t('customRoles.userCount', 'Users')}>{role.userCount ?? 0}</span>
            </span>
          </li>)}
        </ul>}
      </AdminSectionCard>
      <AdminSectionCard
        title={selection.kind === 'new' ? t('customRoles.newTitle', 'New role') : selected ? selected.name : t('customRoles.editorTitle', 'Role')}
        action={selected && !readOnly ? <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="admin-btn admin-btn--secondary" onClick={() => choose({ kind: 'new', basedOnRoleId: selected.id })} type="button">{t('customRoles.createBased', 'Create based on this')}</button>
          <button className="admin-btn admin-btn--danger" disabled={saving} onClick={() => setArchiving(true)} type="button">{t('customRoles.archive', 'Archive')}</button>
        </span> : selected ? <button className="admin-btn admin-btn--secondary" onClick={() => choose({ kind: 'new', basedOnRoleId: selected.id })} type="button">{t('customRoles.createBased', 'Create based on this')}</button> : undefined}
      >
        {selection.kind === 'none' ? <EmptyState message={t('customRoles.pick', 'Choose a role on the left or create a new one.')} /> : selection.kind === 'role' && !selected ? <PageState message={t('customRoles.roleNotFound', 'The role no longer exists. Reload the list.')} variant="error" action={<button className="admin-btn admin-btn--secondary" onClick={() => void reloadSelected()} type="button">{t('customRoles.reload', 'Reload')}</button>} /> : <div style={{ display: 'grid', gap: 16 }}>
          {readOnly ? <p className="admin-form__hint" role="status" style={{ margin: 0 }}>{t('customRoles.archivedNote', 'The role is archived: it gives nothing and cannot be assigned or edited. Create a new role based on it to reuse its rights.')}</p> : null}
          <RoleEditor errors={errors} form={form} onChange={(next) => { setForm(next); setErrors({}); }} readOnly={Boolean(readOnly)} />
          {banner ? <p className={banner.kind === 'ok' ? 'admin-form__hint' : 'admin-form__error'} role={banner.kind === 'ok' ? 'status' : 'alert'} style={{ margin: 0 }}>{banner.text}{banner.kind === 'conflict' ? <> <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void reloadSelected()} type="button">{t('customRoles.reload', 'Reload')}</button></> : null}</p> : null}
          {readOnly ? null : <div className="admin-form__actions">
            {dirty ? <span className="admin-form__hint" role="status">{t('customRoles.unsaved', 'There are unsaved changes.')}</span> : null}
            <button className="admin-btn admin-btn--secondary" disabled={!dirty || saving} onClick={() => { if (selection.kind === 'role') open(selection); else open({ kind: 'new', ...(selection.basedOnRoleId ? { basedOnRoleId: selection.basedOnRoleId } : {}) }); }} type="button">{t('customRoles.revert', 'Discard changes')}</button>
            <button className="admin-btn admin-btn--primary" disabled={saving || (selection.kind === 'role' && !dirty)} onClick={() => void save()} type="button">{saving ? t('customRoles.saving', 'Saving...') : t('customRoles.save', 'Save')}</button>
          </div>}
          {selected ? <RoleAssignments assignments={assignments} disabled={Boolean(readOnly) || dirty} onChanged={async () => { await Promise.all([loadAssignments(selected.id), refresh()]); }} roleId={selected.id} users={users} /> : null}
          {selected && dirty && !readOnly ? <p className="admin-form__hint" style={{ margin: 0 }}>{t('customRoles.saveBeforeAssign', 'Save the role before assigning it.')}</p> : null}
        </div>}
      </AdminSectionCard>
    </div>
    <ConfirmDialog
      cancelLabel={t('customRoles.stay', 'Stay')}
      confirmLabel={t('customRoles.leave', 'Discard and continue')}
      message={t('customRoles.leaveConfirm', 'There are unsaved changes in the role. Discard them?')}
      onCancel={() => setPending(null)}
      onConfirm={() => { const next = pending; setPending(null); if (next) open(next); }}
      open={pending !== null}
      title={t('customRoles.leaveTitle', 'Unsaved changes')}
      variant="danger"
    />
    <ConfirmDialog
      cancelLabel={t('customRoles.cancel', 'Cancel')}
      confirmLabel={t('customRoles.archive', 'Archive')}
      message={t('customRoles.archiveConfirm', 'Archive "{{name}}"? Its users lose these rights from their next request; the history stays.', { name: selected?.name ?? '' })}
      onCancel={() => setArchiving(false)}
      onConfirm={() => void archive()}
      open={archiving}
      title={t('customRoles.archiveTitle', 'Archive role')}
      variant="danger"
    />
  </AdminPageLayout>;
}
