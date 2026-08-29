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
  type DepartmentType,
} from '../shared/api/departments.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { Button, EmptyState, PageState } from '../shared/ui.js';
import { DepartmentTree } from './admin-departments/DepartmentTree.js';
import {
  ancestorIdsToExpand,
  buildCreateDepartmentPayload,
  buildUpdateDepartmentPayload,
  editDepartmentFormState,
  initialDepartmentFormState,
  initialTreeState,
  resolveDepartmentMoveErrorMessage,
  resolveDepartmentSaveErrorMessage,
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
  }

  async function revealDepartment(id: string) {
    const path = await getDepartmentPath(id);
    dispatchTree({ type: 'mergeNodes', nodes: path });
    for (const ancestor of path) {
      if (ancestor.id === id) continue;
      if (tree.childrenByParentId[ancestor.id] === undefined) {
        const children = await getDepartmentChildren(ancestor.id);
        dispatchTree({ type: 'childrenLoaded', id: ancestor.id, children });
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
      await moveDepartment(moveTarget.id, moveParentId);
      moveDialogRef.current?.close();
      setMoveTarget(null);
      await refreshChildrenOf(previousParentId);
      await refreshChildrenOf(moveParentId);
      if (moveParentId) dispatchTree({ type: 'expandIds', ids: [moveParentId] });
      dispatchTree({ type: 'select', id: moveTarget.id });
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

  const mergedNodesById = { ...Object.fromEntries(roots.map((department) => [department.id, department])), ...tree.nodesById };
  const mergedTreeState = { ...tree, nodesById: mergedNodesById };
  const selected = mergedTreeState.selectedId ? mergedNodesById[mergedTreeState.selectedId] : null;
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
              <p className="admin-form__hint">
                {t('admin.departments.managersPlaceholder', 'Managers — coming soon')} · {t('admin.departments.headcountPlaceholder', 'Headcount — coming soon')}
              </p>
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
              </div>
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
