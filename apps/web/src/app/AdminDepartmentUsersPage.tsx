import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { getDepartment, listDepartments, type Department } from '../shared/api/departments.js';
import {
  bulkTransferDepartmentUsers,
  closeDepartmentMembership,
  createDepartmentMembership,
  listDepartmentUsers,
  listUserDepartmentMemberships,
  transferUserDepartment,
  type DepartmentUserRow,
  type UserMembershipRow,
} from '../shared/api/department-memberships.js';
import { listUsers } from '../shared/api/users.js';
import type { UserSummary } from '../shared/api/types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, DataTable, PageState, Pagination, type Column } from '../shared/ui.js';
import { formatMembershipUserName, membershipCandidatesAvailableToAdd, resolveMembershipErrorMessage } from './admin-department-users/model.js';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

type SavingState = { status: 'idle' | 'saving' | 'error'; message?: string };

type UserSearchState = { term: string; status: 'idle' | 'loading' | 'error'; results: UserSummary[] };
const IDLE_USER_SEARCH: UserSearchState = { term: '', status: 'idle', results: [] };

/** Debounced server-side user search for the "add membership" picker, same pattern used elsewhere. */
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
      listUsers({ search: term, pageSize: 20 })
        // listUsers has no server-side status filter; a suspended/invited/archived user would
        // otherwise appear pickable here but always get rejected by ensureAssignable on submit.
        .then((res) => { if (!cancelled) setSearch((prev) => ({ ...prev, status: 'idle', results: res.items.filter((u) => u.status === 'active') })); })
        .catch(() => { if (!cancelled) setSearch((prev) => ({ ...prev, status: 'error', results: [] })); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search.term]);

  return [search, (term: string) => setSearch((prev) => ({ ...prev, term }))];
}

type DeptSearchState = { term: string; status: 'idle' | 'loading' | 'error'; results: Department[] };
const IDLE_DEPT_SEARCH: DeptSearchState = { term: '', status: 'idle', results: [] };

/** Debounced server-side department search for the transfer-target picker. */
function useDepartmentSearch(): [DeptSearchState, (term: string) => void] {
  const [search, setSearch] = useState<DeptSearchState>(IDLE_DEPT_SEARCH);

  useEffect(() => {
    const term = search.term.trim();
    if (!term) {
      setSearch((prev) => (prev.status === 'idle' && prev.results.length === 0 ? prev : { ...prev, status: 'idle', results: [] }));
      return;
    }
    let cancelled = false;
    setSearch((prev) => ({ ...prev, status: 'loading' }));
    const timer = setTimeout(() => {
      // Both single and bulk transfer reject an archived target department with a 409, so
      // offering one here (DepartmentsService.listDepartments applies no default status
      // filter) would let a user pick an option that always fails to confirm.
      listDepartments({ search: term, pageSize: 20, status: 'active' })
        .then((res) => { if (!cancelled) setSearch((prev) => ({ ...prev, status: 'idle', results: res.items })); })
        .catch(() => { if (!cancelled) setSearch((prev) => ({ ...prev, status: 'error', results: [] })); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search.term]);

  return [search, (term: string) => setSearch((prev) => ({ ...prev, term }))];
}

/** Fetched only when its row is expanded -- current + historical memberships for one user. */
function MembershipHistory({ userId, t }: { userId: string; t: TFunction }) {
  const { state } = useAsyncData<UserMembershipRow[]>(
    () => listUserDepartmentMemberships(userId),
    [userId],
    {
      unauthenticated: t('admin.departmentUsers.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.departmentUsers.historyError', 'Unable to load history.'),
    },
  );

  if (state.status === 'loading') return <p className="admin-form__hint" role="status">{t('admin.departments.childrenLoading', 'Loading…')}</p>;
  if (state.status !== 'loaded') return <p className="admin-form__error" role="alert">{'message' in state ? state.message : ''}</p>;
  if (state.data.length === 0) return <p className="admin-form__hint">{t('admin.departmentUsers.noHistory', 'No history yet.')}</p>;

  return (
    <ul className="admin-membership-list">
      {state.data.map((row) => (
        <li key={row.id}>
          <span>
            {row.department.name} — {row.isPrimary ? t('admin.departmentUsers.primary', 'Primary') : t('admin.departmentUsers.additional', 'Additional')}
            {' '}({new Date(row.effectiveFrom).toLocaleDateString()} – {row.effectiveTo ? new Date(row.effectiveTo).toLocaleDateString() : t('admin.departmentUsers.current', 'current')})
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AdminDepartmentUsersPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const departmentId = id ?? '';

  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { state: departmentState } = useAsyncData<Department>(
    () => getDepartment(departmentId),
    [departmentId],
    {
      unauthenticated: t('admin.departmentUsers.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.departmentUsers.loadError', 'Unable to load the department.'),
    },
  );

  const { state: usersState, reload } = useAsyncData(
    () => listDepartmentUsers(departmentId, { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    [departmentId, page, debouncedSearch],
    {
      unauthenticated: t('admin.departmentUsers.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.departmentUsers.loadError', 'Unable to load users.'),
    },
  );

  // Unpaginated (up to the API's own pageSize cap), unfiltered-by-search fetch used only to
  // exclude every current member from the add-membership picker -- `rows` is just the current
  // page of the (possibly search-filtered) table above, so using it alone would let an admin
  // pick an existing member who simply isn't on the visible page, always ending in a 409.
  const { state: allMembersState, reload: reloadAllMembers } = useAsyncData(
    () => listDepartmentUsers(departmentId, { pageSize: 200 }),
    [departmentId],
    { unauthenticated: '', error: '' },
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const [addUserId, setAddUserId] = useState('');
  const [addPrimary, setAddPrimary] = useState(false);
  const [addSearch, setAddSearchTerm] = useUserSearch();
  const [addState, setAddState] = useState<SavingState>({ status: 'idle' });

  const transferDialogRef = useRef<HTMLDialogElement>(null);
  const [transferUserIds, setTransferUserIds] = useState<string[] | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferSearch, setTransferSearchTerm] = useDepartmentSearch();
  const [transferState, setTransferState] = useState<SavingState>({ status: 'idle' });

  const [closeState, setCloseState] = useState<SavingState>({ status: 'idle' });

  useEffect(() => {
    if (transferUserIds !== null) transferDialogRef.current?.showModal();
    else transferDialogRef.current?.close();
  }, [transferUserIds]);

  const rows = usersState.status === 'loaded' ? usersState.data.items : [];
  const total = usersState.status === 'loaded' ? usersState.data.total : 0;

  async function handleAddMembership() {
    if (!addUserId || departmentState.status !== 'loaded') return;
    setAddState({ status: 'saving' });
    try {
      await createDepartmentMembership({ organizationId: departmentState.data.organizationId, departmentId, userId: addUserId, isPrimary: addPrimary });
      setAddUserId('');
      setAddPrimary(false);
      setAddSearchTerm('');
      await Promise.all([reload(), reloadAllMembers()]);
      setAddState({ status: 'idle' });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setAddState({
        status: 'error',
        message: resolveMembershipErrorMessage(
          status,
          t('admin.departmentUsers.addConflict', 'This user already has a current membership here, or already has a primary department.'),
          t('admin.departmentUsers.addError', 'Unable to add the membership.'),
        ),
      });
    }
  }

  async function handleCloseMembership(membershipId: string) {
    setCloseState({ status: 'saving' });
    try {
      await closeDepartmentMembership(membershipId);
      await Promise.all([reload(), reloadAllMembers()]);
      setCloseState({ status: 'idle' });
    } catch {
      setCloseState({ status: 'error', message: t('admin.departmentUsers.closeError', 'Unable to close the membership.') });
    }
  }

  function openTransfer(userIds: string[]) {
    setTransferUserIds(userIds);
    setTransferTargetId(null);
    setTransferSearchTerm('');
    setTransferState({ status: 'idle' });
  }

  async function handleConfirmTransfer() {
    if (!transferUserIds || !transferTargetId) return;
    setTransferState({ status: 'saving' });
    try {
      if (transferUserIds.length === 1) {
        await transferUserDepartment(transferUserIds[0]!, transferTargetId);
      } else {
        await bulkTransferDepartmentUsers(transferTargetId, transferUserIds);
      }
      setTransferUserIds(null);
      setSelectedKeys(new Set());
      await Promise.all([reload(), reloadAllMembers()]);
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setTransferState({
        status: 'error',
        message: resolveMembershipErrorMessage(
          status,
          t('admin.departmentUsers.transferConflict', 'One or more users cannot be transferred there.'),
          t('admin.departmentUsers.transferError', 'Unable to transfer.'),
        ),
      });
    }
  }

  if (departmentState.status === 'loading' || usersState.status === 'loading') {
    return <main className="admin-state"><PageState message={t('admin.departmentUsers.loading', 'Loading department users...')} variant="loading" /></main>;
  }
  if (departmentState.status === 'unauthenticated' || usersState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.departmentUsers.title', 'Department users')}
          message={t('admin.departmentUsers.sessionExpired', 'Your session expired. Sign in again.')}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }
  if (departmentState.status !== 'loaded' || usersState.status !== 'loaded') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.departmentUsers.title', 'Department users')} message={t('admin.departmentUsers.loadError', 'Unable to load department users.')} variant="error" />
      </main>
    );
  }

  const department = departmentState.data;
  const currentMemberIds = allMembersState.status === 'loaded' ? allMembersState.data.items.map((row) => row.userId) : rows.map((row) => row.userId);
  const addCandidates = membershipCandidatesAvailableToAdd(addSearch.results, currentMemberIds);
  const transferCandidates = transferSearch.results.filter((candidate) => candidate.id !== departmentId);

  const navItems: AdminNavItem[] = [
    { label: t('admin.departments.title', 'Departments'), href: '/admin/departments' },
    { label: department.name, href: `/admin/departments/${departmentId}/users`, isCurrent: true },
  ];

  const columns: Column<DepartmentUserRow>[] = [
    { key: 'name', label: t('admin.departmentUsers.colName', 'Name'), render: (row) => formatMembershipUserName(row.user) },
    { key: 'email', label: t('admin.departmentUsers.colEmail', 'Email'), render: (row) => row.user.email, priority: 'secondary' },
    {
      key: 'membershipType',
      label: t('admin.departmentUsers.colMembership', 'Membership'),
      render: (row) => (
        <Badge variant="neutral">{row.isPrimary ? t('admin.departmentUsers.primary', 'Primary') : t('admin.departmentUsers.additional', 'Additional')}</Badge>
      ),
    },
    {
      key: 'actions',
      label: t('admin.departmentUsers.colActions', 'Actions'),
      render: (row) => (
        <span className="admin-table-actions">
          {/* Transfer moves a user's PRIMARY department (POST /users/:id/department-transfer) --
              offering it on an additional-membership row would silently move a department
              unrelated to the row the admin clicked, so it's primary-only. */}
          {row.isPrimary ? (
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openTransfer([row.userId])}>
              {t('admin.departmentUsers.transfer', 'Transfer')}
            </button>
          ) : (
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleCloseMembership(row.id)}>
              {t('admin.departments.close', 'Close')}
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader
        eyebrow={t('admin.departmentUsers.eyebrow', 'Department users')}
        title={department.name}
        subtitle={t('admin.departmentUsers.subtitle', 'Current members, transfers, and membership history.')}
      />

      <div className="admin-card">
        <div className="admin-form__field">
          <label htmlFor="department-users-search">{t('admin.departmentUsers.search', 'Search users')}</label>
          <input
            id="department-users-search"
            type="search"
            value={searchTerm}
            placeholder={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {closeState.status === 'error' ? <p className="admin-form__error" role="alert">{closeState.message}</p> : null}

        <DataTable<DepartmentUserRow>
          label={t('admin.departmentUsers.tableLabel', 'Department users')}
          columns={columns}
          rows={rows}
          keyExtractor={(row) => row.id}
          emptyMessage={t('admin.departmentUsers.empty', 'No current users.')}
          selection={{
            selectedKeys,
            onChange: setSelectedKeys,
            // Bulk transfer moves each selected user's PRIMARY department, same reasoning as the
            // single-row Transfer action above -- only primary rows are selectable.
            isRowSelectable: (row) => row.isPrimary,
            selectAllLabel: t('admin.departmentUsers.selectAll', 'Select all rows'),
            rowLabel: (row) => t('admin.departmentUsers.selectRow', 'Select {{name}}', { name: formatMembershipUserName(row.user) }),
          }}
          batchActions={(selectedRows) => (
            <Button onClick={() => openTransfer(selectedRows.map((row) => row.userId))} size="sm" type="button" variant="secondary">
              {t('admin.departmentUsers.bulkTransfer', 'Transfer selected')}
            </Button>
          )}
          expansion={{
            expandedKeys,
            onChange: setExpandedKeys,
            render: (row) => <MembershipHistory t={t} userId={row.userId} />,
            expandLabel: (row) => t('admin.departmentUsers.showHistory', 'Show history for {{name}}', { name: formatMembershipUserName(row.user) }),
            collapseLabel: (row) => t('admin.departmentUsers.hideHistory', 'Hide history for {{name}}', { name: formatMembershipUserName(row.user) }),
          }}
        />

        <Pagination label={t('admin.departmentUsers.paginationLabel', 'Department users pagination')} onPage={setPage} page={page} pageSize={PAGE_SIZE} total={total} />

        <section className="admin-membership-section">
          <h3>{t('admin.departmentUsers.addTitle', 'Add additional membership')}</h3>
          <div className="admin-membership-add">
            <input
              type="search"
              value={addSearch.term}
              placeholder={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
              aria-label={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
              onChange={(e) => { setAddSearchTerm(e.target.value); setAddUserId(''); }}
            />
            <select value={addUserId} aria-label={t('admin.groups.selectUser', 'Select a user…')} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">{t('admin.groups.selectUser', 'Select a user…')}</option>
              {addCandidates.map((user) => <option key={user.id} value={user.id}>{formatMembershipUserName(user)}</option>)}
            </select>
            <label>
              <input checked={addPrimary} onChange={(e) => setAddPrimary(e.target.checked)} type="checkbox" />
              {' '}{t('admin.departmentUsers.primary', 'Primary')}
            </label>
            <button className="admin-btn admin-btn--sm admin-btn--primary" disabled={!addUserId || addState.status === 'saving'} onClick={() => void handleAddMembership()} type="button">
              {t('admin.departments.add', 'Add')}
            </button>
          </div>
          {addState.status === 'error' ? <p className="admin-form__error" role="alert">{addState.message}</p> : null}
        </section>
      </div>

      <dialog ref={transferDialogRef} className="admin-dialog" onClose={() => setTransferUserIds(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.departmentUsers.transferDialogTitle', 'Transfer {{count}} user(s)', { count: transferUserIds?.length ?? 0 })}</h2>
          <button aria-label={t('admin.departments.close', 'Close')} className="admin-dialog__close" onClick={() => transferDialogRef.current?.close()} type="button">×</button>
        </header>
        <div className="admin-form">
          <FormField id="department-transfer-search" label={t('admin.departments.searchPlaceholder', 'Search by name or code…')}>
            <input id="department-transfer-search" onChange={(e) => setTransferSearchTerm(e.target.value)} type="search" value={transferSearch.term} />
          </FormField>
          {/* Distinct class from the page's own "Add additional membership" toolbar below --
              both used to share admin-membership-add, and since a <dialog> stays in the DOM
              even while closed, an unscoped selector for either one would match both. */}
          <div className="admin-transfer-target">
            <select
              aria-label={t('admin.departmentUsers.selectTarget', 'Select target department…')}
              onChange={(e) => setTransferTargetId(e.target.value || null)}
              value={transferTargetId ?? ''}
            >
              <option value="">{t('admin.departmentUsers.selectTarget', 'Select target department…')}</option>
              {transferCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </div>
          {transferState.status === 'error' ? <p className="admin-form__error" role="alert">{transferState.message}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={() => transferDialogRef.current?.close()} type="button">{t('admin.departments.cancel', 'Cancel')}</button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={!transferTargetId || transferState.status === 'saving'}
              onClick={() => void handleConfirmTransfer()}
              type="button"
            >
              {transferState.status === 'saving' ? t('admin.departments.saving', 'Saving...') : t('admin.departmentUsers.transfer', 'Transfer')}
            </button>
          </div>
        </div>
      </dialog>
    </AdminPageLayout>
  );
}
