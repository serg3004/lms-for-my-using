import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest, getCurrentUser } from '../shared/apiClient.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  buildCreateGroupPayload,
  buildUpdateGroupPayload,
  computeOrgStats,
  formatManagerCell,
  formatUserName,
  initialCreateFormState,
  initialEditFormState,
  resolveGroupSaveErrorMessage,
  usersAvailableToAdd,
  validateGroupName,
} from './admin-org-structure/model.js';
import { slugify } from '../shared/slugify.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { Button, DataTable, EmptyState, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import type { PaginatedResponse, UserSummary } from '../shared/api/types.js';

type GroupStatus = 'active' | 'archived';

type Group = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  status: GroupStatus;
  _count: { members: number };
  managers: Array<{ manager: { id: string; firstName: string; lastName: string } }>;
};

type AdminOrgStructureData = { organizationId: string; groups: Group[]; employeeCount: number };

export function AdminOrgStructurePage() {
  const { t } = useTranslation();

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'name'>>({});
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<GroupStatus>('active');
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'name'>>({});
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const membersDialogRef = useRef<HTMLDialogElement>(null);
  const [membersGroup, setMembersGroup] = useState<Group | null>(null);
  const [orgUsers, setOrgUsers] = useState<UserSummary[]>([]);
  const [groupMembers, setGroupMembers] = useState<UserSummary[]>([]);
  const [groupManagers, setGroupManagers] = useState<UserSummary[]>([]);
  const [membersState, setMembersState] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addManagerUserId, setAddManagerUserId] = useState('');

  const { state: loadState, reload: load } = useAsyncData<AdminOrgStructureData>(
    async () => {
      const [user, groups, { total }] = await Promise.all([
        getCurrentUser(),
        apiRequest<Group[]>('/groups'),
        apiRequest<PaginatedResponse<unknown>>('/users?pageSize=1'),
      ]);
      return { organizationId: user.organizationId, groups, employeeCount: total };
    },
    [t],
    {
      unauthenticated: t('admin.orgStructure.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.orgStructure.loadError', 'Unable to load organization structure.'),
    },
  );

  useEffect(() => {
    if (showCreate) createDialogRef.current?.showModal();
    else createDialogRef.current?.close();
  }, [showCreate]);

  function openCreateDialog() {
    const initial = initialCreateFormState();
    setName(initial.name);
    setLocation(initial.location);
    setDescription(initial.description);
    setCreateErrors({});
    setSubmitState({ status: 'idle' });
    setShowCreate(true);
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== 'loaded') return;

    const groupName = name.trim();
    const errors = validateGroupName(groupName, t('admin.orgStructure.nameRequired', 'Name is required.'));
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Group>('/groups', {
        method: 'POST',
        body: JSON.stringify(buildCreateGroupPayload(loadState.data.organizationId, slugify(groupName), { name, location, description })),
      });
      setShowCreate(false);
      await load();
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      const message = resolveGroupSaveErrorMessage(
        status,
        t('admin.orgStructure.groupExists', 'A department with this slug already exists.'),
        t('admin.orgStructure.saveError', 'Unable to save the department.'),
      );
      setSubmitState({ status: 'error', message });
    }
  }

  function openEditDialog(group: Group) {
    const initial = initialEditFormState(group);
    setEditGroup(group);
    setEditName(initial.name);
    setEditLocation(initial.location);
    setEditDescription(initial.description);
    setEditStatus(initial.status);
    setEditErrors({});
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editGroup) return;

    const groupName = editName.trim();
    const errors = validateGroupName(groupName, t('admin.orgStructure.nameRequired', 'Name is required.'));
    if (hasValidationErrors(errors)) { setEditErrors(errors); return; }
    setEditErrors({});

    setEditState({ status: 'saving' });

    try {
      await apiRequest<Group>(`/groups/${encodeURIComponent(editGroup.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(buildUpdateGroupPayload({ name: editName, location: editLocation, description: editDescription, status: editStatus })),
      });
      editDialogRef.current?.close();
      setEditGroup(null);
      await load();
    } catch {
      setEditState({ status: 'error', message: t('admin.orgStructure.saveError', 'Unable to save the department.') });
    }
  }

  async function openMembersDialog(group: Group) {
    setMembersGroup(group);
    setAddMemberUserId('');
    setAddManagerUserId('');
    setMembersState({ status: 'loading' });
    membersDialogRef.current?.showModal();

    try {
      const [users, members, managers] = await Promise.all([
        orgUsers.length > 0 ? orgUsers : apiRequest<PaginatedResponse<UserSummary>>('/users?pageSize=200').then((res) => res.items),
        apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(group.id)}/members`),
        apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(group.id)}/managers`),
      ]);
      setOrgUsers(users);
      setGroupMembers(members);
      setGroupManagers(managers);
      setMembersState({ status: 'idle' });
    } catch {
      setMembersState({
        status: 'error',
        message: t('admin.orgStructure.membersLoadError', 'Unable to load department members.'),
      });
    }
  }

  function closeMembersDialog() {
    membersDialogRef.current?.close();
    setMembersGroup(null);
  }

  async function handleAddMember() {
    if (!membersGroup || !addMemberUserId) return;
    try {
      const members = await apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(membersGroup.id)}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: addMemberUserId }),
      });
      setGroupMembers(members);
      setAddMemberUserId('');
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.orgStructure.saveError', 'Unable to save the department.') });
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!membersGroup) return;
    try {
      const members = await apiRequest<UserSummary[]>(
        `/groups/${encodeURIComponent(membersGroup.id)}/members/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
      setGroupMembers(members);
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.orgStructure.saveError', 'Unable to save the department.') });
    }
  }

  async function handleAddManager() {
    if (!membersGroup || !addManagerUserId) return;
    try {
      const managers = await apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(membersGroup.id)}/managers`, {
        method: 'POST',
        body: JSON.stringify({ managerId: addManagerUserId }),
      });
      setGroupManagers(managers);
      setAddManagerUserId('');
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.orgStructure.saveError', 'Unable to save the department.') });
    }
  }

  async function handleRemoveManager(managerId: string) {
    if (!membersGroup) return;
    try {
      const managers = await apiRequest<UserSummary[]>(
        `/groups/${encodeURIComponent(membersGroup.id)}/managers/${encodeURIComponent(managerId)}`,
        { method: 'DELETE' },
      );
      setGroupManagers(managers);
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.orgStructure.saveError', 'Unable to save the department.') });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.orgStructure.loading', 'Loading organization structure...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.orgStructure.title', 'Organization')}
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
        <PageState title={t('admin.orgStructure.title', 'Organization')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const { groups, employeeCount } = loadState.data;
  const stats = computeOrgStats(groups, employeeCount);

  const navItems: AdminNavItem[] = [
    { label: t('admin.orgStructure.title', 'Organization'), href: '/admin/org-structure', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.orgStructure.eyebrow', 'Company structure')}
        title={t('admin.orgStructure.title', 'Organization')}
        subtitle={t('admin.orgStructure.subtitle', 'Departments, managers and headcount.')}
        action={
          <Button variant="primary" type="button" onClick={openCreateDialog}>
            + {t('admin.orgStructure.add', 'Add department')}
          </Button>
        }
      />

      <StatsGrid>
        <StatCard label={t('admin.orgStructure.statUnits', 'Departments')} value={stats.departments} />
        <StatCard label={t('admin.orgStructure.statEmployees', 'Employees')} value={stats.employees} />
        <StatCard label={t('admin.orgStructure.statManagers', 'Managers')} value={stats.managers} />
        <StatCard label={t('admin.orgStructure.statLocations', 'Locations')} value={stats.locations} />
      </StatsGrid>

      {groups.length === 0 ? (
        <EmptyState message={t('admin.orgStructure.empty', 'No departments found.')} />
      ) : (
        <DataTable<Group>
          columns={[
            { key: 'name', label: t('admin.orgStructure.colUnit', 'Department'), render: (g) => g.name },
            { key: 'manager', label: t('admin.orgStructure.colHead', 'Manager'), render: (g) => formatManagerCell(g) },
            { key: 'members', label: t('admin.orgStructure.colPeople', 'Employees'), render: (g) => g._count.members },
            { key: 'actions', label: '', render: (g) => (
              <span className="admin-table-actions">
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openMembersDialog(g)}>
                  {t('admin.orgStructure.members', 'Members')}
                </button>
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEditDialog(g)}>
                  {t('admin.orgStructure.edit', 'Edit')}
                </button>
              </span>
            )},
          ] satisfies Column<Group>[]}
          rows={groups}
          keyExtractor={(g) => g.id}
          emptyMessage={t('admin.orgStructure.empty', 'No departments found.')}
        />
      )}

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => setShowCreate(false)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.orgStructure.createDialogTitle', 'Add department')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.orgStructure.close', 'Close')} onClick={() => setShowCreate(false)}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleCreateGroup}>
          <FormField id="group-create-name" label={t('admin.orgStructure.fieldName', 'Name')} required error={createErrors.name}>
            <input
              id="group-create-name"
              value={name}
              maxLength={120}
              aria-describedby={createErrors.name ? 'group-create-name-error' : undefined}
              aria-invalid={Boolean(createErrors.name)}
              onChange={(e) => { setName(e.target.value); setCreateErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="group-create-location" label={t('admin.orgStructure.fieldLocation', 'Location')}>
            <input id="group-create-location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} />
          </FormField>
          <FormField id="group-create-description" label={t('admin.orgStructure.fieldDescription', 'Description')}>
            <textarea id="group-create-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          {submitState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{submitState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowCreate(false)}>
              {t('admin.orgStructure.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
              {submitState.status === 'saving' ? t('admin.orgStructure.saving', 'Saving...') : t('admin.orgStructure.create', 'Create')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialogRef} className="admin-dialog" onClose={() => setEditGroup(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.orgStructure.editDialogTitle', 'Edit department')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.orgStructure.close', 'Close')} onClick={() => editDialogRef.current?.close()}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateGroup}>
          <FormField id="group-edit-name" label={t('admin.orgStructure.fieldName', 'Name')} required error={editErrors.name}>
            <input
              id="group-edit-name"
              value={editName}
              maxLength={120}
              aria-describedby={editErrors.name ? 'group-edit-name-error' : undefined}
              aria-invalid={Boolean(editErrors.name)}
              onChange={(e) => { setEditName(e.target.value); setEditErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="group-edit-location" label={t('admin.orgStructure.fieldLocation', 'Location')}>
            <input id="group-edit-location" value={editLocation} maxLength={120} onChange={(e) => setEditLocation(e.target.value)} />
          </FormField>
          <FormField id="group-edit-description" label={t('admin.orgStructure.fieldDescription', 'Description')}>
            <textarea id="group-edit-description" value={editDescription} maxLength={500} onChange={(e) => setEditDescription(e.target.value)} />
          </FormField>
          <FormField id="group-edit-status" label={t('admin.orgStructure.fieldStatus', 'Status')}>
            <select id="group-edit-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as GroupStatus)}>
              <option value="active">{t('admin.orgStructure.statusActive', 'Active')}</option>
              <option value="archived">{t('admin.orgStructure.statusArchived', 'Archived')}</option>
            </select>
          </FormField>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{editState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => editDialogRef.current?.close()}>
              {t('admin.orgStructure.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving' ? t('admin.orgStructure.saving', 'Saving...') : t('admin.orgStructure.save', 'Save')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={membersDialogRef} className="admin-dialog" onClose={closeMembersDialog}>
        <header className="admin-dialog__header">
          <h2>{membersGroup ? t('admin.orgStructure.membersDialogTitle', 'Manage {{name}}', { name: membersGroup.name }) : ''}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.orgStructure.close', 'Close')} onClick={closeMembersDialog}>
            ×
          </button>
        </header>
        <div className="admin-form">
          {membersState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{membersState.message}</p>
          ) : null}

          <section className="admin-membership-section">
            <h3>{t('admin.orgStructure.managersTitle', 'Managers')}</h3>
            <ul className="admin-membership-list">
              {groupManagers.length === 0 ? (
                <li className="admin-membership-list__empty">{t('admin.orgStructure.noManagers', 'No managers assigned.')}</li>
              ) : (
                groupManagers.map((manager) => (
                  <li key={manager.id}>
                    <span>{formatUserName(manager)}</span>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      type="button"
                      onClick={() => void handleRemoveManager(manager.id)}
                    >
                      {t('admin.orgStructure.remove', 'Remove')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="admin-membership-add">
              <select value={addManagerUserId} onChange={(e) => setAddManagerUserId(e.target.value)}>
                <option value="">{t('admin.orgStructure.selectUser', 'Select a user…')}</option>
                {usersAvailableToAdd(orgUsers, groupManagers.map((m) => m.id)).map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
              <button className="admin-btn admin-btn--sm admin-btn--primary" type="button" disabled={!addManagerUserId} onClick={() => void handleAddManager()}>
                {t('admin.orgStructure.add', 'Add')}
              </button>
            </div>
          </section>

          <section className="admin-membership-section">
            <h3>{t('admin.orgStructure.membersTitle', 'Members')}</h3>
            <ul className="admin-membership-list">
              {groupMembers.length === 0 ? (
                <li className="admin-membership-list__empty">{t('admin.orgStructure.noMembers', 'No members yet.')}</li>
              ) : (
                groupMembers.map((member) => (
                  <li key={member.id}>
                    <span>{formatUserName(member)}</span>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      type="button"
                      onClick={() => void handleRemoveMember(member.id)}
                    >
                      {t('admin.orgStructure.remove', 'Remove')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="admin-membership-add">
              <select value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}>
                <option value="">{t('admin.orgStructure.selectUser', 'Select a user…')}</option>
                {usersAvailableToAdd(orgUsers, groupMembers.map((m) => m.id)).map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
              <button className="admin-btn admin-btn--sm admin-btn--primary" type="button" disabled={!addMemberUserId} onClick={() => void handleAddMember()}>
                {t('admin.orgStructure.add', 'Add')}
              </button>
            </div>
          </section>

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={closeMembersDialog}>
              {t('admin.orgStructure.close', 'Close')}
            </button>
          </div>
        </div>
      </dialog>
    </AdminPageLayout>
  );
}
