import { type FormEvent, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import {
  archiveDepartment,
  archiveDepartmentType,
  createDepartment,
  createDepartmentType,
  getDepartmentChildren,
  getDepartmentPath,
  getDepartmentTree,
  listDepartments,
  listDepartmentTypes,
  moveDepartment,
  restoreDepartment,
  restoreDepartmentType,
  updateDepartment,
  type Department,
  type DepartmentManagerMode,
  type DepartmentType,
} from '../shared/api/departments.js';
import {
  closeDepartmentManager,
  createDepartmentManager,
  getEffectiveDepartmentManagers,
  updateDepartmentManagerModes,
  type DepartmentManagerType,
  type EffectiveDepartmentManager,
} from '../shared/api/department-managers.js';
import { listUsers } from '../shared/api/users.js';
import type { UserSummary } from '../shared/api/types.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { Badge, Button, EmptyState, PageState } from '../shared/ui.js';
import { DepartmentTree } from './admin-departments/DepartmentTree.js';
import {
  ancestorIdsToExpand,
  buildCreateDepartmentPayload,
  buildUpdateDepartmentPayload,
  collectLoadedDescendantIds,
  editDepartmentFormState,
  formatManagerUserName,
  initialDepartmentFormState,
  initialTreeState,
  managerCandidatesAvailableToAdd,
  managersOfType,
  resolveDepartmentMoveErrorMessage,
  resolveDepartmentSaveErrorMessage,
  resolveManagerModeErrorMessage,
  resolveManagerSaveErrorMessage,
  sortManagersForDisplay,
  summarizeDirectManagers,
  treeReducer,
  validateDepartmentName,
  validateDepartmentTypeFields,
} from './admin-departments/model.js';

const SEARCH_DEBOUNCE_MS = 300;

type SearchState = { term: string; status: 'idle' | 'loading' | 'error'; results: Department[] };
const IDLE_SEARCH: SearchState = { term: '', status: 'idle', results: [] };

/** Debounced flat department search, used both for the tree search box and the move-target picker. */
function useDepartmentSearch(): [SearchState, (term: string) => void] {
  const [search, setSearch] = useState<SearchState>(IDLE_SEARCH);

  useEffect(() => {
    const term = search.term.trim();
    if (!term) {
      setSearch((prev) => (prev.status === 'idle' && prev.results.length === 0 ? prev : { ...prev, status: 'idle', results: [] }));
      return;
    }

    let cancelled = false;
    setSearch((prev) => ({ ...prev, status: 'loading' }));
    const timer = setTimeout(() => {
      listDepartments({ search: term, pageSize: 20 })
        .then((res) => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'idle', results: res.items }));
        })
        .catch(() => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'error', results: [] }));
        });
    }, SEARCH_DEBOUNCE_MS);

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

type UserSearchState = { term: string; status: 'idle' | 'loading' | 'error'; results: UserSummary[] };
const IDLE_USER_SEARCH: UserSearchState = { term: '', status: 'idle', results: [] };

/** Debounced server-side user search for the manager-candidate pickers, same pattern as admin groups. */
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
        .then((res) => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'idle', results: res.items.filter((u) => u.status === 'active') }));
        })
        .catch(() => {
          if (!cancelled) setSearch((prev) => ({ ...prev, status: 'error', results: [] }));
        });
    }, SEARCH_DEBOUNCE_MS);

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

type SavingState = { status: 'idle' | 'saving' | 'error'; message?: string };

export function AdminDepartmentsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();

  const [tree, dispatchTree] = useReducer(treeReducer, initialTreeState());
  const [search, setSearchTerm] = useDepartmentSearch();

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [createForm, setCreateForm] = useState(initialDepartmentFormState());
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'name'>>({});
  const [createState, setCreateState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [editForm, setEditForm] = useState(initialDepartmentFormState());
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'name'>>({});
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const moveDialogRef = useRef<HTMLDialogElement>(null);
  const [moveTarget, setMoveTarget] = useState<Department | null>(null);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [moveSearch, setMoveSearchTerm] = useDepartmentSearch();
  const [moveState, setMoveState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const [archiveTarget, setArchiveTarget] = useState<Department | null>(null);
  const [statusActionState, setStatusActionState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const typesDialogRef = useRef<HTMLDialogElement>(null);
  const [typesDialogOpen, setTypesDialogOpen] = useState(false);
  const [typesOverride, setTypesOverride] = useState<DepartmentType[] | null>(null);
  const [typeForm, setTypeForm] = useState({ code: '', name: '' });
  const [typeErrors, setTypeErrors] = useState<FormValidationErrors<'code' | 'name'>>({});
  const [typeState, setTypeState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  // Managers section of the detail panel (PR 273): loaded fresh whenever the selection changes.
  const [managers, setManagers] = useState<EffectiveDepartmentManager[]>([]);
  const [managersState, setManagersState] = useState<SavingState>({ status: 'idle' });
  const [ancestorNamesById, setAncestorNamesById] = useState<Record<string, string>>({});
  const [directMode, setDirectMode] = useState<DepartmentManagerMode>('LOCAL');
  const [functionalMode, setFunctionalMode] = useState<DepartmentManagerMode>('LOCAL');
  const [modeState, setModeState] = useState<SavingState>({ status: 'idle' });
  const [managerActionState, setManagerActionState] = useState<SavingState>({ status: 'idle' });
  const [directAddUserId, setDirectAddUserId] = useState('');
  const [directAddIsPrimary, setDirectAddIsPrimary] = useState(false);
  const [directSearch, setDirectSearchTerm] = useUserSearch();
  const [functionalAddUserId, setFunctionalAddUserId] = useState('');
  const [functionalAddIsPrimary, setFunctionalAddIsPrimary] = useState(false);
  const [functionalSearch, setFunctionalSearchTerm] = useUserSearch();

  const { state: loadState, reload } = useAsyncData<{ organizationId: string; roots: Department[]; types: DepartmentType[] }>(
    async () => {
      const [roots, departmentTypes] = await Promise.all([getDepartmentTree(), listDepartmentTypes()]);
      return { organizationId: currentUser!.organizationId, roots, types: departmentTypes };
    },
    [currentUser, t],
    {
      unauthenticated: t('admin.departments.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.departments.loadError', 'Unable to load departments.'),
    },
  );

  // Roots and department types come straight from the load, like every other admin list page --
  // `typesOverride` layers on local create/archive/restore mutations without needing a reload.
  const roots = loadState.status === 'loaded' ? loadState.data.roots : [];
  const rootIds = roots.map((department) => department.id);
  const types = typesOverride ?? (loadState.status === 'loaded' ? loadState.data.types : []);

  // Computed here (rather than after the loading/error early-returns below) so the manager-load
  // effect right after can depend on `selected`.
  const mergedNodesById = { ...Object.fromEntries(roots.map((department) => [department.id, department])), ...tree.nodesById };
  const mergedTreeState = { ...tree, nodesById: mergedNodesById };
  const selected = mergedTreeState.selectedId ? mergedNodesById[mergedTreeState.selectedId] : null;

  // reloadManagers() below is async and can resolve after the admin has since selected a
  // different department; a ref (not the `selected` this closure captured at call time) is
  // needed to check the *current* selection when the fetch actually completes.
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  useEffect(() => {
    if (!selected) {
      setManagers([]);
      setAncestorNamesById({});
      return;
    }
    setDirectMode(selected.directManagerMode);
    setFunctionalMode(selected.functionalManagerMode);
    setDirectAddUserId('');
    setDirectAddIsPrimary(false);
    setFunctionalAddUserId('');
    setFunctionalAddIsPrimary(false);
    setManagerActionState({ status: 'idle' });
    setModeState({ status: 'idle' });
    setManagersState({ status: 'saving' }); // reuses 'saving' as the loading flag for this section
    let cancelled = false;
    Promise.all([getEffectiveDepartmentManagers(selected.id), getDepartmentPath(selected.id)])
      .then(([effective, path]) => {
        if (cancelled) return;
        setManagers(effective);
        setAncestorNamesById(Object.fromEntries(path.map((department) => [department.id, department.name])));
        setManagersState({ status: 'idle' });
      })
      .catch(() => {
        if (!cancelled) setManagersState({ status: 'error', message: t('admin.departments.managersLoadError', 'Unable to load managers.') });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the selected department's id should retrigger this load
  }, [selected?.id]);

  // Refetches the effective manager set for `id` and every already-loaded descendant of it
  // (whose cached badge/popover data would otherwise go stale -- moving a subtree or changing
  // an ancestor's managers/mode can change any INHERIT/MERGE descendant's effective set).
  // Shared by reloadManagers() (mutations on the selected department) and handleMoveDepartment()
  // (the moved department's ancestor chain, and therefore its own effective set, changes even
  // though its own id does not).
  async function refreshManagerCachesFor(id: string): Promise<EffectiveDepartmentManager[]> {
    const effective = await getEffectiveDepartmentManagers(id);
    dispatchTree({ type: 'managerSummaryLoaded', id, summary: summarizeDirectManagers(effective) });
    dispatchTree({ type: 'managerDetailsLoaded', id, managers: effective });

    const descendantIds = collectLoadedDescendantIds(tree.childrenByParentId, id).filter(
      (descendantId) => tree.managerSummaryById[descendantId] !== undefined || tree.managerDetailsById[descendantId] !== undefined,
    );
    await Promise.all(
      descendantIds.map(async (descendantId) => {
        try {
          const descendantEffective = await getEffectiveDepartmentManagers(descendantId);
          dispatchTree({ type: 'managerSummaryLoaded', id: descendantId, summary: summarizeDirectManagers(descendantEffective) });
          dispatchTree({ type: 'managerDetailsLoaded', id: descendantId, managers: descendantEffective });
        } catch {
          // Invalidate rather than leave the previous cache entry: managerDetailsById is
          // treated as "already fetched" once defined (handleRequestManagerDetails skips
          // refetching it), so a stale success value here would never be retried by reselecting
          // or reopening the popover -- only clearing it lets the next request try again.
          dispatchTree({ type: 'managerCacheInvalidated', id: descendantId });
        }
      }),
    );
    return effective;
  }

  async function reloadManagers() {
    if (!selected) return;
    const departmentId = selected.id;
    const effective = await refreshManagerCachesFor(departmentId);
    // The refetch is async and can resolve after the admin has since selected a different
    // department -- only apply it to the detail panel's own `managers` state if that
    // department is still the one selected, so a slow refresh for A can't overwrite B's panel.
    if (selectedIdRef.current === departmentId) setManagers(effective);
  }

  async function handleAddManager(type: DepartmentManagerType) {
    if (!selected) return;
    const userId = type === 'DIRECT' ? directAddUserId : functionalAddUserId;
    const isPrimary = type === 'DIRECT' ? directAddIsPrimary : functionalAddIsPrimary;
    if (!userId) return;
    setManagerActionState({ status: 'saving' });
    try {
      await createDepartmentManager({ organizationId: selected.organizationId, departmentId: selected.id, userId, type, isPrimary });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setManagerActionState({
        status: 'error',
        message: resolveManagerSaveErrorMessage(
          status,
          t('admin.departments.managerConflict', 'This user is already a manager of this type, or a primary manager already exists.'),
          t('admin.departments.managerSaveError', 'Unable to save the manager.'),
        ),
      });
      return;
    }
    if (type === 'DIRECT') { setDirectAddUserId(''); setDirectAddIsPrimary(false); setDirectSearchTerm(''); } else { setFunctionalAddUserId(''); setFunctionalAddIsPrimary(false); setFunctionalSearchTerm(''); }
    try {
      await reloadManagers();
      setManagerActionState({ status: 'idle' });
    } catch {
      // The manager was already saved successfully -- only the list refresh failed. Reporting
      // this as a save failure would be wrong and could prompt a retry that then 409s.
      setManagerActionState({ status: 'error', message: t('admin.departments.managerRefreshError', 'Saved, but the list could not be refreshed. Reselect the department to see the latest managers.') });
    }
  }

  async function handleCloseManager(managerId: string) {
    setManagerActionState({ status: 'saving' });
    try {
      await closeDepartmentManager(managerId);
    } catch {
      setManagerActionState({ status: 'error', message: t('admin.departments.managerCloseError', 'Unable to close the manager.') });
      return;
    }
    try {
      await reloadManagers();
      setManagerActionState({ status: 'idle' });
    } catch {
      setManagerActionState({ status: 'error', message: t('admin.departments.managerRefreshError', 'Saved, but the list could not be refreshed. Reselect the department to see the latest managers.') });
    }
  }

  async function handleSaveManagerModes() {
    if (!selected) return;
    setModeState({ status: 'saving' });
    let updated: { directManagerMode: string; functionalManagerMode: string };
    try {
      updated = await updateDepartmentManagerModes(selected.id, { directManagerMode: directMode, functionalManagerMode: functionalMode });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setModeState({
        status: 'error',
        message: resolveManagerModeErrorMessage(
          status,
          t('admin.departments.managerModeConflict', 'Close current local managers of this type before switching to Inherit.'),
          t('admin.departments.managerSaveError', 'Unable to save the manager.'),
        ),
      });
      return;
    }
    dispatchTree({
      type: 'upsertNode',
      node: { ...selected, directManagerMode: updated.directManagerMode as DepartmentManagerMode, functionalManagerMode: updated.functionalManagerMode as DepartmentManagerMode },
    });
    try {
      await reloadManagers();
      setModeState({ status: 'idle' });
    } catch {
      setModeState({ status: 'error', message: t('admin.departments.managerRefreshError', 'Saved, but the list could not be refreshed. Reselect the department to see the latest managers.') });
    }
  }

  async function handleRequestManagerDetails(department: Department) {
    if (tree.managerDetailsById[department.id] !== undefined) return;
    try {
      const effective = await getEffectiveDepartmentManagers(department.id);
      dispatchTree({ type: 'managerDetailsLoaded', id: department.id, managers: effective });
    } catch {
      // Leave managerDetailsById[id] undefined (not []) on a transient failure -- the guard
      // above treats any defined value, including an empty array, as "fetched and empty", so
      // caching [] here would make a real error look like "no managers" and block the popover
      // from ever retrying on a later open.
    }
  }

  async function loadManagerSummaries(nodes: Department[]) {
    await Promise.all(
      nodes.map(async (node) => {
        try {
          const effective = await getEffectiveDepartmentManagers(node.id);
          dispatchTree({ type: 'managerSummaryLoaded', id: node.id, summary: summarizeDirectManagers(effective) });
        } catch {
          // Leave managerSummaryById[id] as-is (undefined, if never loaded) on a transient
          // failure -- dispatching null here would be indistinguishable from a genuine "no
          // DIRECT managers" result and permanently hide a real badge with no retry path.
        }
      }),
    );
  }

  useEffect(() => {
    if (roots.length > 0) void loadManagerSummaries(roots);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the root id set actually changes
  }, [rootIds.join(',')]);

  useEffect(() => {
    if (createParentId !== undefined) createDialogRef.current?.showModal();
    else createDialogRef.current?.close();
  }, [createParentId]);

  useEffect(() => {
    if (typesDialogOpen) typesDialogRef.current?.showModal();
    else typesDialogRef.current?.close();
  }, [typesDialogOpen]);

  function typeLabel(typeId: string | null): string | null {
    if (!typeId) return null;
    return types.find((type) => type.id === typeId)?.name ?? null;
  }

  async function loadChildrenFor(department: Department) {
    dispatchTree({ type: 'childrenLoading', id: department.id });
    try {
      const children = await getDepartmentChildren(department.id);
      dispatchTree({ type: 'childrenLoaded', id: department.id, children });
      void loadManagerSummaries(children);
    } catch {
      dispatchTree({ type: 'childrenLoaded', id: department.id, children: [] });
    }
  }

  function handleToggleExpand(department: Department) {
    if (tree.expandedIds[department.id]) {
      dispatchTree({ type: 'toggleExpand', id: department.id });
      return;
    }
    if (tree.childrenByParentId[department.id] === undefined) {
      void loadChildrenFor(department);
    } else {
      dispatchTree({ type: 'toggleExpand', id: department.id });
    }
  }

  async function refreshChildrenOf(parentId: string | null) {
    if (parentId === null) {
      await reload();
      return;
    }
    const children = await getDepartmentChildren(parentId);
    dispatchTree({ type: 'childrenLoaded', id: parentId, children });
    void loadManagerSummaries(children);
  }

  async function revealDepartment(id: string) {
    const path = await getDepartmentPath(id);
    dispatchTree({ type: 'mergeNodes', nodes: path });
    for (const ancestor of path) {
      if (ancestor.id === id) continue;
      if (tree.childrenByParentId[ancestor.id] === undefined) {
        const children = await getDepartmentChildren(ancestor.id);
        dispatchTree({ type: 'childrenLoaded', id: ancestor.id, children });
        void loadManagerSummaries(children);
      }
    }
    dispatchTree({ type: 'expandIds', ids: ancestorIdsToExpand(path, id) });
    dispatchTree({ type: 'select', id });
    setSearchTerm('');
  }

  function openCreateDialog(parentId: string | null) {
    setCreateParentId(parentId);
    setCreateForm(initialDepartmentFormState());
    setCreateErrors({});
    setCreateState({ status: 'idle' });
  }

  async function handleCreateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== 'loaded' || createParentId === undefined) return;

    const errors = validateDepartmentName(createForm.name, t('admin.departments.nameRequired', 'Name is required.'));
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});
    setCreateState({ status: 'saving' });

    try {
      await createDepartment(buildCreateDepartmentPayload(loadState.data.organizationId, createParentId, createForm));
      setCreateParentId(undefined);
      await refreshChildrenOf(createParentId);
      if (createParentId) dispatchTree({ type: 'expandIds', ids: [createParentId] });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setCreateState({
        status: 'error',
        message: resolveDepartmentSaveErrorMessage(
          status,
          t('admin.departments.codeExists', 'A department with this code already exists.'),
          t('admin.departments.saveError', 'Unable to save the department.'),
        ),
      });
    }
  }

  function openEditDialog(department: Department) {
    setEditTarget(department);
    setEditForm(editDepartmentFormState(department));
    setEditErrors({});
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;

    const errors = validateDepartmentName(editForm.name, t('admin.departments.nameRequired', 'Name is required.'));
    if (hasValidationErrors(errors)) { setEditErrors(errors); return; }
    setEditErrors({});
    setEditState({ status: 'saving' });

    try {
      const updated = await updateDepartment(editTarget.id, buildUpdateDepartmentPayload(editForm));
      dispatchTree({ type: 'upsertNode', node: updated });
      editDialogRef.current?.close();
      setEditTarget(null);
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setEditState({
        status: 'error',
        message: resolveDepartmentSaveErrorMessage(
          status,
          t('admin.departments.codeExists', 'A department with this code already exists.'),
          t('admin.departments.saveError', 'Unable to save the department.'),
        ),
      });
    }
  }

  function openMoveDialog(department: Department) {
    setMoveTarget(department);
    setMoveParentId(department.parentId);
    setMoveSearchTerm('');
    setMoveState({ status: 'idle' });
    moveDialogRef.current?.showModal();
  }

  async function handleMoveDepartment() {
    if (!moveTarget) return;
    const previousParentId = moveTarget.parentId;
    setMoveState({ status: 'saving' });

    try {
      const movedId = moveTarget.id;
      const wasAlreadySelected = selected?.id === movedId;
      await moveDepartment(movedId, moveParentId);
      moveDialogRef.current?.close();
      setMoveTarget(null);
      await refreshChildrenOf(previousParentId);
      await refreshChildrenOf(moveParentId);
      if (moveParentId) dispatchTree({ type: 'expandIds', ids: [moveParentId] });
      dispatchTree({ type: 'select', id: movedId });
      if (wasAlreadySelected) {
        // Moving a department changes its ancestor chain and therefore its own effective
        // INHERIT/MERGE managers, but its id doesn't change -- the detail-panel-loading effect
        // (keyed on selected?.id) won't refire on its own, so refresh explicitly.
        const [effective, path] = await Promise.all([refreshManagerCachesFor(movedId), getDepartmentPath(movedId)]);
        // Same guard as reloadManagers(): these requests are async and the admin may have
        // since selected a different department, so only apply the result if `movedId` is
        // still selected -- otherwise this would write A's managers/path into B's panel.
        if (selectedIdRef.current === movedId) {
          setManagers(effective);
          setAncestorNamesById(Object.fromEntries(path.map((department) => [department.id, department.name])));
        }
      }
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setMoveState({
        status: 'error',
        message: resolveDepartmentMoveErrorMessage(
          status,
          t('admin.departments.depthExceeded', 'This move would exceed the maximum department depth.'),
          t('admin.departments.moveConflict', 'This department cannot be moved there.'),
          t('admin.departments.saveError', 'Unable to save the department.'),
        ),
      });
    }
  }

  async function handleArchiveConfirmed() {
    if (!archiveTarget) return;
    const department = archiveTarget;
    setStatusActionState({ status: 'saving' });
    try {
      const updated = await archiveDepartment(department.id);
      // The parent's refreshed children list stops including this node (active-only by default),
      // but the still-selected node's own cached copy would otherwise keep showing stale "active"
      // data in the detail panel -- upsert it with the server's fresh (archived) copy.
      dispatchTree({ type: 'upsertNode', node: updated });
      setArchiveTarget(null);
      setStatusActionState({ status: 'idle' });
      await refreshChildrenOf(department.parentId);
    } catch {
      setStatusActionState({ status: 'error', message: t('admin.departments.archiveError', 'Unable to archive the department.') });
    }
  }

  async function handleRestore(department: Department) {
    setStatusActionState({ status: 'saving' });
    try {
      const updated = await restoreDepartment(department.id);
      dispatchTree({ type: 'upsertNode', node: updated });
      setStatusActionState({ status: 'idle' });
      await refreshChildrenOf(department.parentId);
    } catch {
      setStatusActionState({ status: 'error', message: t('admin.departments.restoreError', 'Unable to restore the department.') });
    }
  }

  function openTypesDialog() {
    setTypeForm({ code: '', name: '' });
    setTypeErrors({});
    setTypeState({ status: 'idle' });
    setTypesDialogOpen(true);
  }

  async function handleCreateType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== 'loaded') return;

    const errors = validateDepartmentTypeFields(typeForm.code, typeForm.name, {
      codeRequired: t('admin.departments.typeCodeRequired', 'Code is required.'),
      nameRequired: t('admin.departments.nameRequired', 'Name is required.'),
    });
    if (hasValidationErrors(errors)) { setTypeErrors(errors); return; }
    setTypeErrors({});
    setTypeState({ status: 'saving' });

    try {
      const created = await createDepartmentType({
        organizationId: loadState.data.organizationId,
        code: typeForm.code.trim(),
        name: typeForm.name.trim(),
      });
      setTypesOverride([...types, created]);
      setTypeForm({ code: '', name: '' });
      setTypeState({ status: 'idle' });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      setTypeState({
        status: 'error',
        message: resolveDepartmentSaveErrorMessage(
          status,
          t('admin.departments.typeCodeExists', 'A department type with this code already exists.'),
          t('admin.departments.saveError', 'Unable to save the department type.'),
        ),
      });
    }
  }

  async function handleToggleTypeStatus(type: DepartmentType) {
    setTypeState({ status: 'saving' });
    try {
      const updated = type.isActive ? await archiveDepartmentType(type.id) : await restoreDepartmentType(type.id);
      setTypesOverride(types.map((t2) => (t2.id === updated.id ? updated : t2)));
      setTypeState({ status: 'idle' });
    } catch {
      setTypeState({ status: 'error', message: t('admin.departments.saveError', 'Unable to save the department type.') });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.departments.loading', 'Loading departments...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.departments.title', 'Departments')}
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
        <PageState title={t('admin.departments.title', 'Departments')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const navItems: AdminNavItem[] = [
    { label: t('admin.departments.title', 'Departments'), href: '/admin/departments', isCurrent: true },
  ];

  const activeTypes = types.filter((type) => type.isActive);
  const moveCandidates = moveSearch.results.filter((d) => d.id !== moveTarget?.id);

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader
        eyebrow={t('admin.departments.eyebrow', 'Departments')}
        title={t('admin.departments.title', 'Departments')}
        subtitle={t('admin.departments.subtitle', 'Organization structure as a department tree.')}
        action={
          <span className="admin-table-actions">
            <Button variant="secondary" type="button" onClick={openTypesDialog}>
              {t('admin.departments.manageTypes', 'Department types')}
            </Button>
            <Button variant="primary" type="button" onClick={() => openCreateDialog(null)}>
              + {t('admin.departments.addRoot', 'Add root department')}
            </Button>
          </span>
        }
      />

      <div className="admin-departments-layout">
        <div className="admin-card">
          <div className="admin-form__field">
            <label htmlFor="department-search">{t('admin.departments.search', 'Search departments')}</label>
            <input
              id="department-search"
              type="search"
              value={search.term}
              placeholder={t('admin.departments.searchPlaceholder', 'Search by name or code…')}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {search.term.trim() && search.status !== 'idle' ? (
            <p className="admin-form__hint">{search.status === 'loading' ? t('admin.departments.searching', 'Searching…') : t('admin.departments.searchError', 'Unable to search departments.')}</p>
          ) : search.term.trim() && search.results.length > 0 ? (
            <ul className="admin-membership-list">
              {search.results.map((result) => (
                <li key={result.id}>
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void revealDepartment(result.id)}>
                    {result.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : search.term.trim() ? (
            <p className="admin-form__hint">{t('admin.departments.noSearchResults', 'No matching departments.')}</p>
          ) : null}

          {rootIds.length === 0 ? (
            <EmptyState message={t('admin.departments.treeEmpty', 'No departments yet.')} />
          ) : (
            <DepartmentTree
              rootIds={rootIds}
              state={mergedTreeState}
              onToggleExpand={handleToggleExpand}
              onSelect={(id) => dispatchTree({ type: 'select', id })}
              onRequestManagerDetails={(department) => void handleRequestManagerDetails(department)}
              typeLabel={typeLabel}
              t={t}
            />
          )}
        </div>

        <div className="admin-departments-layout__detail">
          {selected ? (
            <article className="admin-card">
              <h2>{selected.name}</h2>
              {selected.status === 'archived' ? <p className="admin-form__hint">{t('admin.departments.archived', 'Archived')}</p> : null}
              {selected.code ? <p>{t('admin.departments.fieldCode', 'Code')}: {selected.code}</p> : null}
              <p>{t('admin.departments.fieldType', 'Type')}: {typeLabel(selected.departmentTypeId) ?? t('admin.departments.noType', 'Not set')}</p>
              {selected.description ? <p>{selected.description}</p> : null}
              <p className="admin-form__hint">{t('admin.departments.headcountPlaceholder', 'Headcount — coming soon')}</p>
              {statusActionState.status === 'error' ? <p className="admin-form__error" role="alert">{statusActionState.message}</p> : null}
              <div className="admin-table-actions">
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openCreateDialog(selected.id)}>
                  {t('admin.departments.addChild', 'Add child')}
                </button>
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEditDialog(selected)}>
                  {t('admin.departments.edit', 'Edit')}
                </button>
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openMoveDialog(selected)}>
                  {t('admin.departments.move', 'Move')}
                </button>
                {selected.status === 'active' ? (
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => setArchiveTarget(selected)}>
                    {t('admin.departments.archiveAction', 'Archive')}
                  </button>
                ) : (
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleRestore(selected)}>
                    {t('admin.departments.restoreAction', 'Restore')}
                  </button>
                )}
                <a className="admin-btn admin-btn--sm admin-btn--secondary" href={`/admin/departments/${encodeURIComponent(selected.id)}/users`}>
                  {t('admin.departments.viewUsers', 'Users')}
                </a>
              </div>

              <section className="admin-membership-section">
                <h3>{t('admin.departments.managersTitle', 'Managers')}</h3>
                {managersState.status === 'saving' ? (
                  <p className="admin-form__hint" role="status">{t('admin.departments.childrenLoading', 'Loading…')}</p>
                ) : managersState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">{managersState.message}</p>
                ) : (
                  <>
                    {(['DIRECT', 'FUNCTIONAL'] as const).map((type) => {
                      const typeManagers = sortManagersForDisplay(managersOfType(managers, type));
                      const search = type === 'DIRECT' ? directSearch : functionalSearch;
                      const setSearchTermForType = type === 'DIRECT' ? setDirectSearchTerm : setFunctionalSearchTerm;
                      const addUserId = type === 'DIRECT' ? directAddUserId : functionalAddUserId;
                      const setAddUserId = type === 'DIRECT' ? setDirectAddUserId : setFunctionalAddUserId;
                      const addIsPrimary = type === 'DIRECT' ? directAddIsPrimary : functionalAddIsPrimary;
                      const setAddIsPrimary = type === 'DIRECT' ? setDirectAddIsPrimary : setFunctionalAddIsPrimary;
                      // Exclude only already-LOCAL users, not every effective (incl. inherited) one:
                      // in MERGE mode an inherited manager can validly also be assigned locally --
                      // effective-managers.ts's dedup lets the local assignment win for that user.
                      const localTypeUserIds = typeManagers.filter((m) => m.source === 'LOCAL').map((m) => m.userId);
                      const candidates = managerCandidatesAvailableToAdd(search.results, localTypeUserIds);
                      const typeTitle = type === 'DIRECT' ? t('admin.departments.managerTypeDirect', 'Direct') : t('admin.departments.managerTypeFunctional', 'Functional');
                      // Gate on the *persisted* mode (selected.*ManagerMode), not the draft
                      // directMode/functionalMode selector state: an admin can flip that selector
                      // to Local without pressing Save, and the server is still INHERIT until it
                      // is. A local manager assigned while the server-side mode is INHERIT is
                      // silently excluded from the effective set (computeEffectiveDepartmentManagers
                      // ignores local rows in INHERIT mode), so it would vanish from this list on
                      // reload and later conflict with switching back to INHERIT.
                      const persistedTypeMode = type === 'DIRECT' ? selected.directManagerMode : selected.functionalManagerMode;
                      const addDisabledByMode = persistedTypeMode === 'INHERIT';
                      return (
                        // Distinct class (not admin-membership-section) so it never nests inside
                        // the outer "Managers" section's own matches -- both used to share the
                        // class, making DIRECT vs FUNCTIONAL ambiguous to any selector.
                        <div className="admin-manager-subsection" key={type}>
                          <h4>{typeTitle}</h4>
                          <ul className="admin-membership-list">
                            {typeManagers.length === 0 ? (
                              <li className="admin-membership-list__empty">{t('admin.departments.noManagers', 'No managers assigned.')}</li>
                            ) : (
                              typeManagers.map((manager) => (
                                <li key={manager.id}>
                                  <span>
                                    {manager.user ? formatManagerUserName(manager.user) : t('admin.departments.managerUnknown', 'Unknown')}
                                    {manager.isPrimary ? <> {' '}<Badge variant="neutral">{t('admin.departments.managerPrimary', 'Primary')}</Badge></> : null}
                                    {manager.source === 'INHERITED' ? (
                                      <>
                                        {' '}
                                        <Badge variant="neutral">
                                          {t('admin.departments.managerInheritedFrom', 'Inherited from {{name}}', {
                                            name: ancestorNamesById[manager.sourceDepartmentId] ?? manager.sourceDepartmentId,
                                          })}
                                        </Badge>{' '}
                                        <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void revealDepartment(manager.sourceDepartmentId)}>
                                          {t('admin.departments.managerGoToSource', 'Go to department')}
                                        </button>
                                      </>
                                    ) : null}
                                  </span>
                                  {manager.source === 'LOCAL' ? (
                                    <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleCloseManager(manager.id)}>
                                      {t('admin.departments.close', 'Close')}
                                    </button>
                                  ) : null}
                                </li>
                              ))
                            )}
                          </ul>
                          {addDisabledByMode ? (
                            <p className="admin-form__hint">{t('admin.departments.managerAddDisabledByInherit', 'Switch this type to Local before adding a manager here.')}</p>
                          ) : null}
                          <div className="admin-membership-add">
                            <input
                              type="search"
                              value={search.term}
                              placeholder={t('admin.groups.searchPlaceholder', 'Search by name or email…')}
                              aria-label={`${typeTitle}: ${t('admin.groups.searchPlaceholder', 'Search by name or email…')}`}
                              disabled={addDisabledByMode}
                              onChange={(e) => { setSearchTermForType(e.target.value); setAddUserId(''); }}
                            />
                            <select
                              value={addUserId}
                              aria-label={`${typeTitle}: ${t('admin.groups.selectUser', 'Select a user…')}`}
                              disabled={addDisabledByMode}
                              onChange={(e) => setAddUserId(e.target.value)}
                            >
                              <option value="">{t('admin.groups.selectUser', 'Select a user…')}</option>
                              {candidates.map((u) => <option key={u.id} value={u.id}>{formatManagerUserName(u)}</option>)}
                            </select>
                            <label>
                              <input
                                type="checkbox"
                                checked={addIsPrimary}
                                disabled={addDisabledByMode}
                                onChange={(e) => setAddIsPrimary(e.target.checked)}
                              />
                              {' '}{t('admin.departments.managerPrimary', 'Primary')}
                            </label>
                            <button
                              className="admin-btn admin-btn--sm admin-btn--primary"
                              type="button"
                              disabled={!addUserId || addDisabledByMode || managerActionState.status === 'saving'}
                              onClick={() => void handleAddManager(type)}
                            >
                              {t('admin.departments.add', 'Add')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {managerActionState.status === 'error' ? <p className="admin-form__error" role="alert">{managerActionState.message}</p> : null}

                    <div className="admin-manager-subsection">
                      <h4>{t('admin.departments.managerModesTitle', 'Manager inheritance')}</h4>
                      <div className="admin-form__field">
                        <label htmlFor="department-direct-mode">{t('admin.departments.managerTypeDirect', 'Direct')}</label>
                        <select id="department-direct-mode" value={directMode} onChange={(e) => setDirectMode(e.target.value as DepartmentManagerMode)}>
                          <option value="LOCAL">{t('admin.departments.managerModeLocal', 'Local')}</option>
                          <option value="INHERIT">{t('admin.departments.managerModeInherit', 'Inherit')}</option>
                          <option value="MERGE">{t('admin.departments.managerModeMerge', 'Merge')}</option>
                        </select>
                      </div>
                      <div className="admin-form__field">
                        <label htmlFor="department-functional-mode">{t('admin.departments.managerTypeFunctional', 'Functional')}</label>
                        <select id="department-functional-mode" value={functionalMode} onChange={(e) => setFunctionalMode(e.target.value as DepartmentManagerMode)}>
                          <option value="LOCAL">{t('admin.departments.managerModeLocal', 'Local')}</option>
                          <option value="INHERIT">{t('admin.departments.managerModeInherit', 'Inherit')}</option>
                          <option value="MERGE">{t('admin.departments.managerModeMerge', 'Merge')}</option>
                        </select>
                      </div>
                      {modeState.status === 'error' ? <p className="admin-form__error" role="alert">{modeState.message}</p> : null}
                      <button className="admin-btn admin-btn--sm admin-btn--primary" type="button" disabled={modeState.status === 'saving'} onClick={() => void handleSaveManagerModes()}>
                        {modeState.status === 'saving' ? t('admin.departments.saving', 'Saving...') : t('admin.departments.save', 'Save')}
                      </button>
                    </div>
                  </>
                )}
              </section>
            </article>
          ) : (
            // Plain paragraph, not admin-form__hint: this is the primary (only) content of this
            // panel, not a de-emphasized hint, and admin-form__hint's dimmed color fails WCAG AA
            // color-contrast at this text size regardless of background (2.6-2.8:1 measured
            // against both the page background and a white admin-card, both need 4.5:1).
            <article className="admin-card">
              <p>{t('admin.departments.selectHint', 'Select a department to see its details.')}</p>
            </article>
          )}
        </div>
      </div>

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => setCreateParentId(undefined)}>
        <header className="admin-dialog__header">
          <h2>{createParentId ? t('admin.departments.createChildTitle', 'Add child department') : t('admin.departments.createRootTitle', 'Add root department')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.departments.close', 'Close')} onClick={() => setCreateParentId(undefined)}>×</button>
        </header>
        <form className="admin-form" onSubmit={handleCreateDepartment}>
          <FormField id="department-create-name" label={t('admin.departments.fieldName', 'Name')} required error={createErrors.name}>
            <input
              id="department-create-name"
              value={createForm.name}
              maxLength={160}
              aria-invalid={Boolean(createErrors.name)}
              onChange={(e) => { setCreateForm((prev) => ({ ...prev, name: e.target.value })); setCreateErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="department-create-code" label={t('admin.departments.fieldCode', 'Code')}>
            <input id="department-create-code" value={createForm.code} maxLength={60} onChange={(e) => setCreateForm((prev) => ({ ...prev, code: e.target.value }))} />
          </FormField>
          <FormField id="department-create-type" label={t('admin.departments.fieldType', 'Type')}>
            <select id="department-create-type" value={createForm.departmentTypeId} onChange={(e) => setCreateForm((prev) => ({ ...prev, departmentTypeId: e.target.value }))}>
              <option value="">{t('admin.departments.noType', 'Not set')}</option>
              {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </FormField>
          <FormField id="department-create-description" label={t('admin.departments.fieldDescription', 'Description')}>
            <textarea id="department-create-description" value={createForm.description} maxLength={1000} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} />
          </FormField>
          {createState.status === 'error' ? <p className="admin-form__error" role="alert">{createState.message}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setCreateParentId(undefined)}>{t('admin.departments.cancel', 'Cancel')}</button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={createState.status === 'saving'}>
              {createState.status === 'saving' ? t('admin.departments.saving', 'Saving...') : t('admin.departments.create', 'Create')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialogRef} className="admin-dialog" onClose={() => setEditTarget(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.departments.editDialogTitle', 'Edit department')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.departments.close', 'Close')} onClick={() => editDialogRef.current?.close()}>×</button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateDepartment}>
          <FormField id="department-edit-name" label={t('admin.departments.fieldName', 'Name')} required error={editErrors.name}>
            <input
              id="department-edit-name"
              value={editForm.name}
              maxLength={160}
              aria-invalid={Boolean(editErrors.name)}
              onChange={(e) => { setEditForm((prev) => ({ ...prev, name: e.target.value })); setEditErrors((prev) => clearFieldError(prev, 'name')); }}
            />
          </FormField>
          <FormField id="department-edit-code" label={t('admin.departments.fieldCode', 'Code')}>
            <input id="department-edit-code" value={editForm.code} maxLength={60} onChange={(e) => setEditForm((prev) => ({ ...prev, code: e.target.value }))} />
          </FormField>
          <FormField id="department-edit-type" label={t('admin.departments.fieldType', 'Type')}>
            <select id="department-edit-type" value={editForm.departmentTypeId} onChange={(e) => setEditForm((prev) => ({ ...prev, departmentTypeId: e.target.value }))}>
              <option value="">{t('admin.departments.noType', 'Not set')}</option>
              {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </FormField>
          <FormField id="department-edit-description" label={t('admin.departments.fieldDescription', 'Description')}>
            <textarea id="department-edit-description" value={editForm.description} maxLength={1000} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
          </FormField>
          {editState.status === 'error' ? <p className="admin-form__error" role="alert">{editState.message}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => editDialogRef.current?.close()}>{t('admin.departments.cancel', 'Cancel')}</button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving' ? t('admin.departments.saving', 'Saving...') : t('admin.departments.save', 'Save')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={moveDialogRef} className="admin-dialog" onClose={() => setMoveTarget(null)}>
        <header className="admin-dialog__header">
          <h2>{moveTarget ? t('admin.departments.moveDialogTitle', 'Move {{name}}', { name: moveTarget.name }) : ''}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.departments.close', 'Close')} onClick={() => moveDialogRef.current?.close()}>×</button>
        </header>
        <div className="admin-form">
          <p className="admin-form__hint">{t('admin.departments.moveHint', 'Search for the new parent department, or move it to the root level.')}</p>
          <FormField id="department-move-search" label={t('admin.departments.searchPlaceholder', 'Search by name or code…')}>
            <input id="department-move-search" type="search" value={moveSearch.term} onChange={(e) => setMoveSearchTerm(e.target.value)} />
          </FormField>
          <div className="admin-membership-add">
            <select value={moveParentId ?? ''} onChange={(e) => setMoveParentId(e.target.value || null)}>
              <option value="">{t('admin.departments.moveToRoot', 'Root level (no parent)')}</option>
              {moveCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </div>
          {moveState.status === 'error' ? <p className="admin-form__error" role="alert">{moveState.message}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => moveDialogRef.current?.close()}>{t('admin.departments.cancel', 'Cancel')}</button>
            <button className="admin-btn admin-btn--primary" type="button" disabled={moveState.status === 'saving'} onClick={() => void handleMoveDepartment()}>
              {moveState.status === 'saving' ? t('admin.departments.saving', 'Saving...') : t('admin.departments.move', 'Move')}
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={typesDialogRef} className="admin-dialog" onClose={() => setTypesDialogOpen(false)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.departments.manageTypes', 'Department types')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.departments.close', 'Close')} onClick={() => setTypesDialogOpen(false)}>×</button>
        </header>
        <div className="admin-form">
          <ul className="admin-membership-list">
            {(types ?? []).length === 0 ? (
              <li className="admin-membership-list__empty">{t('admin.departments.noTypes', 'No department types yet.')}</li>
            ) : (
              (types ?? []).map((type) => (
                <li key={type.id}>
                  <span>{type.name} ({type.code}){!type.isActive ? ` — ${t('admin.departments.archived', 'Archived')}` : ''}</span>
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleToggleTypeStatus(type)}>
                    {type.isActive ? t('admin.departments.archiveAction', 'Archive') : t('admin.departments.restoreAction', 'Restore')}
                  </button>
                </li>
              ))
            )}
          </ul>
          <form className="admin-membership-add" onSubmit={handleCreateType}>
            <input
              value={typeForm.code}
              placeholder={t('admin.departments.fieldCode', 'Code')}
              maxLength={60}
              aria-label={t('admin.departments.fieldCode', 'Code')}
              onChange={(e) => { setTypeForm((prev) => ({ ...prev, code: e.target.value })); setTypeErrors((prev) => clearFieldError(prev, 'code')); }}
            />
            <input
              value={typeForm.name}
              placeholder={t('admin.departments.fieldName', 'Name')}
              maxLength={160}
              aria-label={t('admin.departments.fieldName', 'Name')}
              onChange={(e) => { setTypeForm((prev) => ({ ...prev, name: e.target.value })); setTypeErrors((prev) => clearFieldError(prev, 'name')); }}
            />
            <button className="admin-btn admin-btn--sm admin-btn--primary" type="submit" disabled={typeState.status === 'saving'}>
              {t('admin.departments.add', 'Add')}
            </button>
          </form>
          {typeErrors.code || typeErrors.name ? <p className="admin-form__hint">{typeErrors.code ?? typeErrors.name}</p> : null}
          {typeState.status === 'error' ? <p className="admin-form__error" role="alert">{typeState.message}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setTypesDialogOpen(false)}>{t('admin.departments.close', 'Close')}</button>
          </div>
        </div>
      </dialog>

      <ConfirmDialog
        open={archiveTarget !== null}
        title={t('admin.departments.archiveTitle', 'Archive department')}
        message={t('admin.departments.archiveConfirm', 'Archive "{{name}}"? It will be hidden from the active tree.', { name: archiveTarget?.name ?? '' })}
        confirmLabel={t('admin.departments.archiveAction', 'Archive')}
        cancelLabel={t('admin.departments.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void handleArchiveConfirmed()}
        onCancel={() => setArchiveTarget(null)}
      />
    </AdminPageLayout>
  );
}
