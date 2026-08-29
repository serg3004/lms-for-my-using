import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { listUsers } from '../shared/api/users.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  buildCreateGroupPayload,
  buildUpdateGroupPayload,
  computeGroupStats,
  formatManagerCell,
  formatUserName,
  initialCreateFormState,
  initialEditFormState,
  resolveGroupSaveErrorMessage,
  usersAvailableToAdd,
  validateGroupName,
} from './admin-groups/model.js';
import { slugify } from '../shared/slugify.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { Button, DataTable, EmptyState, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import type { UserSummary } from '../shared/api/types.js';

const USER_SEARCH_DEBOUNCE_MS = 300;
const USER_SEARCH_PAGE_SIZE = 20;

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

type AdminGroupsData = { organizationId: string; groups: Group[]; employeeCount: number };

type UserSearchState = { term: string; status: 'idle' | 'loading' | 'error'; results: UserSummary[] };

const IDLE_USER_SEARCH: UserSearchState = { term: '', status: 'idle', results: [] };

/** Debounced server-side user search — replaces prefetching the whole org's users into one dropdown. */
function useUserSearch(): [UserSearchState, (term: string) => void] {
  const [search, setSearch] = useState<UserSearchState>(IDLE_USER_SEARCH);

  useEffect(() => {
    const term = search.term.trim();
    if (!term) {
      setSearch((prev) => (prev.status === 'idle' && prev.results.length === 0 ? prev : { ...prev, status: 'idle', results: [] }));
      return;
    }

    let cancelled = false;
    setSearch((prev) => ({ ...prev, status: 'loading' }));
    const timer = setTimeout(() => {
      listUsers({ search: term, pageSize: USER_SEARCH_PAGE_SIZE })
        .then((res) => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'idle', results: res.items }));
        })
        .catch(() => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'error', results: [] }));
        });
    }, USER_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search.term]);

  function setTerm(term: string) {
    setSearch((prev) => ({ ...prev, term }));
  }

  return [search, setTerm];
}

export function AdminGroupsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();

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
  const [groupMembers, setGroupMembers] = useState<UserSummary[]>([]);
  const [groupManagers, setGroupManagers] = useState<UserSummary[]>([]);
  const [membersState, setMembersState] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addManagerUserId, setAddManagerUserId] = useState('');
  const [memberSearch, setMemberSearchTerm] = useUserSearch();
  const [managerSearch, setManagerSearchTerm] = useUserSearch();

  const { state: loadState, reload: load } = useAsyncData<AdminGroupsData>(
    async () => {
      const [groups, { total }] = await Promise.all([
        apiRequest<Group[]>('/groups'),
        apiRequest<{ total: number }>('/users?pageSize=1'),
      ]);
      return { organizationId: currentUser!.organizationId, groups, employeeCount: total };
    },
    [currentUser, t],
    {
      unauthenticated: t('admin.groups.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.groups.loadError', 'Unable to load groups.'),
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
    const errors = validateGroupName(groupName, t('admin.groups.nameRequired', 'Name is required.'));
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
        t('admin.groups.groupExists', 'A group with this slug already exists.'),
        t('admin.groups.saveError', 'Unable to save the group.'),
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
    const errors = validateGroupName(groupName, t('admin.groups.nameRequired', 'Name is required.'));
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
      setEditState({ status: 'error', message: t('admin.groups.saveError', 'Unable to save the group.') });
    }
  }

  async function openMembersDialog(group: Group) {
    setMembersGroup(group);
    setAddMemberUserId('');
    setAddManagerUserId('');
    setMemberSearchTerm('');
    setManagerSearchTerm('');
    setMembersState({ status: 'loading' });
    membersDialogRef.current?.showModal();

    try {
      const [members, managers] = await Promise.all([
        apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(group.id)}/members`),
        apiRequest<UserSummary[]>(`/groups/${encodeURIComponent(group.id)}/managers`),
      ]);
      setGroupMembers(members);
      setGroupManagers(managers);
      setMembersState({ status: 'idle' });
    } catch {
      setMembersState({
        status: 'error',
        message: t('admin.groups.membersLoadError', 'Unable to load group members.'),
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
      setMemberSearchTerm('');
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.groups.saveError', 'Unable to save the group.') });
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
      setMembersState({ status: 'error', message: t('admin.groups.saveError', 'Unable to save the group.') });
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
      setManagerSearchTerm('');
      await load();
    } catch {
      setMembersState({ status: 'error', message: t('admin.groups.saveError', 'Unable to save the group.') });
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
      setMembersState({ status: 'error', message: t('admin.groups.saveError', 'Unable to save the group.') });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.groups.loading', 'Loading groups...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.groups.title', 'Groups')}
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
        <PageState title={t('admin.groups.title', 'Groups')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const { groups, employeeCount } = loadState.data;
  const stats = computeGroupStats(groups, employeeCount);

  const navItems: AdminNavItem[] = [
    { label: t('admin.groups.title', 'Groups'), href: '/admin/groups', isCurrent: true },
  ];

  const memberCandidates = usersAvailableToAdd(memberSearch.results, groupMembers.map((m) => m.id));
  const managerCandidates = usersAvailableToAdd(managerSearch.results, groupManagers.map((m) => m.id));

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.groups.eyebrow', 'Groups')}
        title={t('admin.groups.title', 'Groups')}
        subtitle={t('admin.groups.subtitle', 'Learning and operational groups, managers and members.')}
        action={
          <Button variant="primary" type="button" onClick={openCreateDialog}>
            + {t('admin.groups.add', 'Add group')}
          </Button>
        }
      />

      <StatsGrid>
        <StatCard label={t('admin.groups.statUnits', 'Groups')} value={stats.groups} />
        <StatCard label={t('admin.groups.statEmployees', 'Members')} value={stats.employees} />
        <StatCard label={t('admin.groups.statManagers', 'Managers')} value={stats.managers} />
        <StatCard label={t('admin.groups.statLocations', 'Locations')} value={stats.locations} />
      </StatsGrid>

      {groups.length === 0 ? (
        <EmptyState message={t('admin.groups.empty', 'No groups found.')} />
      ) : (
        <DataTable<Group>
          label={t('admin.groups.title', 'Groups')}
          columns={[
            { key: 'name', label: t('admin.groups.colUnit', 'Group'), render: (g) => g.name },
            { key: 'manager', label: t('admin.groups.colHead', 'Manager'), render: (g) => formatManagerCell(g) },
            { key: 'members', label: t('admin.groups.colPeople', 'Members'), render: (g) => g._count.members },
            { key: 'actions', label: '', render: (g) => (
              <span className="admin-table-actions">
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openMembersDialog(g)}>
                  {t('admin.groups.members', 'Members')}
                </button>
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEditDialog(g)}>
                  {t('admin.groups.edit', 'Edit')}
                </button>
              </span>
            )},
          ] satisfies Column<Group>[]}
          rows={groups}
          keyExtractor={(g) => g.id}
          emptyMessage={t('admin.groups.empty', 'No groups found.')}
        />
      )}

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => setShowCreate(false)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.groups.createDialogTitle', 'Add group')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.groups.close', 'Close')} onClick={() => setShowCreate(false)}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleCreateGroup}>
          <FormField id="group-create-name" label={t('admin.groups.fieldName', 'Name')} required error={createErrors.name}>
            <input
              id="group-create-name"
              value={name}
              maxLength={120}
              aria-describedby={createErrors.name ? 'group-create-name-error' : undefined}
              aria-invalid={Boolean(createErrors.name)}
              onChange={(e) => { setName(e.target.value); setCreateErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="group-create-location" label={t('admin.groups.fieldLocation', 'Location')}>
            <input id="group-create-location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} />
          </FormField>
          <FormField id="group-create-description" label={t('admin.groups.fieldDescription', 'Description')}>
            <textarea id="group-create-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          {submitState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{submitState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowCreate(false)}>
              {t('admin.groups.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
              {submitState.status === 'saving' ? t('admin.groups.saving', 'Saving...') : t('admin.groups.create', 'Create')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialogRef} className="admin-dialog" onClose={() => setEditGroup(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.groups.editDialogTitle', 'Edit group')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.groups.close', 'Close')} onClick={() => editDialogRef.current?.close()}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateGroup}>
          <FormField id="group-edit-name" label={t('admin.groups.fieldName', 'Name')} required error={editErrors.name}>
            <input
              id="group-edit-name"
              value={editName}
              maxLength={120}
              aria-describedby={editErrors.name ? 'group-edit-name-error' : undefined}
              aria-invalid={Boolean(editErrors.name)}
              onChange={(e) => { setEditName(e.target.value); setEditErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="group-edit-location" label={t('admin.groups.fieldLocation', 'Location')}>
            <input id="group-edit-location" value={editLocation} maxLength={120} onChange={(e) => setEditLocation(e.target.value)} />
          </FormField>
          <FormField id="group-edit-description" label={t('admin.groups.fieldDescription', 'Description')}>
            <textarea id="group-edit-description" value={editDescription} maxLength={500} onChange={(e) => setEditDescription(e.target.value)} />
          </FormField>
          <FormField id="group-edit-status" label={t('admin.groups.fieldStatus', 'Status')}>
            <select id="group-edit-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as GroupStatus)}>
              <option value="active">{t('admin.groups.statusActive', 'Active')}</option>
              <option value="archived">{t('admin.groups.statusArchived', 'Archived')}</option>
            </select>
          </FormField>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{editState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => editDialogRef.current?.close()}>
              {t('admin.groups.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving' ? t('admin.groups.saving', 'Saving...') : t('admin.groups.save', 'Save')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={membersDialogRef} className="admin-dialog" onClose={closeMembersDialog}>
        <header className="admin-dialog__header">
          <h2>{membersGroup ? t('admin.groups.membersDialogTitle', 'Manage {{name}}', { name: membersGroup.name }) : ''}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.groups.close', 'Close')} onClick={closeMembersDialog}>
            ×
          </button>
        </header>
        <div className="admin-form">
          {membersState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{membersState.message}</p>
          ) : null}

          <section className="admin-membership-section">
            <h3>{t('admin.groups.managersTitle', 'Managers')}</h3>
            <ul className="admin-membership-list">
              {groupManagers.length === 0 ? (
                <li className="admin-membership-list__empty">{t('admin.groups.noManagers', 'No managers assigned.')}</li>
              ) : (
                groupManagers.map((manager) => (
                  <li key={manager.id}>
                    <span>{formatUserName(manager)}</span>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      type="button"
                      onClick={() => void handleRemoveManager(manager.id)}
                    >
                      {t('admin.groups.remove', 'Remove')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="admin-membership-add">
              <input
                type="search"
                value={managerSearch.term}
                placeholder={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
                onChange={(e) => { setManagerSearchTerm(e.target.value); setAddManagerUserId(''); }}
              />
              <select value={addManagerUserId} onChange={(e) => setAddManagerUserId(e.target.value)}>
                <option value="">{t('admin.groups.selectUser', 'Select a user…')}</option>
                {managerCandidates.map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
              <button className="admin-btn admin-btn--sm admin-btn--primary" type="button" disabled={!addManagerUserId} onClick={() => void handleAddManager()}>
                {t('admin.groups.add', 'Add')}
              </button>
            </div>
            {managerSearch.status === 'error' ? (
              <p className="admin-form__hint">{t('admin.groups.searchError', 'Unable to search users.')}</p>
            ) : managerSearch.term.trim() && managerSearch.status === 'idle' && managerCandidates.length === 0 ? (
              <p className="admin-form__hint">{t('admin.groups.noSearchResults', 'No matching users.')}</p>
            ) : null}
          </section>

          <section className="admin-membership-section">
            <h3>{t('admin.groups.membersTitle', 'Members')}</h3>
            <ul className="admin-membership-list">
              {groupMembers.length === 0 ? (
                <li className="admin-membership-list__empty">{t('admin.groups.noMembers', 'No members yet.')}</li>
              ) : (
                groupMembers.map((member) => (
                  <li key={member.id}>
                    <span>{formatUserName(member)}</span>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      type="button"
                      onClick={() => void handleRemoveMember(member.id)}
                    >
                      {t('admin.groups.remove', 'Remove')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="admin-membership-add">
              <input
                type="search"
                value={memberSearch.term}
                placeholder={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
                onChange={(e) => { setMemberSearchTerm(e.target.value); setAddMemberUserId(''); }}
              />
              <select value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}>
                <option value="">{t('admin.groups.selectUser', 'Select a user…')}</option>
                {memberCandidates.map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
              <button className="admin-btn admin-btn--sm admin-btn--primary" type="button" disabled={!addMemberUserId} onClick={() => void handleAddMember()}>
                {t('admin.groups.add', 'Add')}
              </button>
            </div>
            {memberSearch.status === 'error' ? (
              <p className="admin-form__hint">{t('admin.groups.searchError', 'Unable to search users.')}</p>
            ) : memberSearch.term.trim() && memberSearch.status === 'idle' && memberCandidates.length === 0 ? (
              <p className="admin-form__hint">{t('admin.groups.noSearchResults', 'No matching users.')}</p>
            ) : null}
          </section>

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={closeMembersDialog}>
              {t('admin.groups.close', 'Close')}
            </button>
          </div>
        </div>
      </dialog>
    </AdminPageLayout>
  );
}
