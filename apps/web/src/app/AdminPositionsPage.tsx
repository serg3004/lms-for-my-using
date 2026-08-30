import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import {
  archivePosition,
  createPosition,
  listPositions,
  restorePosition,
  updatePosition,
  type Position,
  type PositionStatus,
} from '../shared/api/positions.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { Button, DataTable, EmptyState, PageState, Pagination, Toolbar, type Column } from '../shared/ui.js';

const PAGE_SIZE = 20;

type CreateFormState = { code: string; title: string; description: string };
type EditFormState = { code: string; title: string; description: string };

const EMPTY_CREATE_FORM: CreateFormState = { code: '', title: '', description: '' };

function toEditForm(position: Position): EditFormState {
  return { code: position.code, title: position.title, description: position.description ?? '' };
}

export function AdminPositionsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PositionStatus | ''>('');

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'code' | 'title'>>({});
  const [createState, setCreateState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_CREATE_FORM);
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'code' | 'title'>>({});
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const { state: loadState, reload: load } = useAsyncData(
    () => listPositions({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined, status: status || undefined }),
    [page, search, status],
    {
      unauthenticated: t('admin.positions.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.positions.loadError', 'Unable to load positions.'),
    },
  );

  useEffect(() => {
    if (showCreate) createDialogRef.current?.showModal();
    else createDialogRef.current?.close();
  }, [showCreate]);

  function openCreateDialog() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateErrors({});
    setCreateState({ status: 'idle' });
    setShowCreate(true);
  }

  function validate(form: CreateFormState): FormValidationErrors<'code' | 'title'> {
    const errors: FormValidationErrors<'code' | 'title'> = {};
    if (!form.code.trim()) errors.code = t('admin.positions.codeRequired', 'Code is required.');
    if (!form.title.trim()) errors.title = t('admin.positions.titleRequired', 'Title is required.');
    return errors;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== 'loaded' || !currentUser) return;

    const errors = validate(createForm);
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});
    setCreateState({ status: 'saving' });

    try {
      await createPosition({
        organizationId: currentUser.organizationId,
        code: createForm.code.trim(),
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
      });
      setShowCreate(false);
      await load();
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      const message =
        status === 409
          ? t('admin.positions.codeExists', 'A position with this code already exists.')
          : t('admin.positions.saveError', 'Unable to save the position.');
      setCreateState({ status: 'error', message });
    }
  }

  function openEditDialog(position: Position) {
    setEditPosition(position);
    setEditForm(toEditForm(position));
    setEditErrors({});
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editPosition) return;

    const errors = validate(editForm);
    if (hasValidationErrors(errors)) { setEditErrors(errors); return; }
    setEditErrors({});
    setEditState({ status: 'saving' });

    try {
      await updatePosition(editPosition.id, {
        code: editForm.code.trim(),
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
      });
      editDialogRef.current?.close();
      setEditPosition(null);
      await load();
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      const message =
        status === 409
          ? t('admin.positions.codeExists', 'A position with this code already exists.')
          : t('admin.positions.saveError', 'Unable to save the position.');
      setEditState({ status: 'error', message });
    }
  }

  async function handleArchive(position: Position) {
    await archivePosition(position.id);
    await load();
  }

  async function handleRestore(position: Position) {
    await restorePosition(position.id);
    await load();
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.positions.loading', 'Loading positions...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.positions.title', 'Positions')}
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
        <PageState title={t('admin.positions.title', 'Positions')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const { items, total } = loadState.data;

  const navItems: AdminNavItem[] = [
    { label: t('admin.positions.title', 'Positions'), href: '/admin/positions', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.positions.eyebrow', 'Organization structure')}
        title={t('admin.positions.title', 'Positions')}
        subtitle={t('admin.positions.subtitle', 'A tenant-wide catalog of job titles that can be assigned to department memberships.')}
        action={
          <Button variant="primary" type="button" onClick={openCreateDialog}>
            + {t('admin.positions.add', 'Add position')}
          </Button>
        }
      />

      <Toolbar
        left={
          <>
            <label className="admin-users-filter">
              <span>{t('admin.positions.searchLabel', 'Search')}</span>
              <input
                type="search"
                value={search}
                placeholder={t('admin.positions.searchPlaceholder', 'Search by code or title…')}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <label className="admin-users-filter">
              <span>{t('admin.positions.statusLabel', 'Status')}</span>
              <select value={status} onChange={(e) => { setStatus(e.target.value as PositionStatus | ''); setPage(1); }}>
                <option value="">{t('admin.positions.statusAll', 'All statuses')}</option>
                <option value="active">{t('admin.positions.statusActive', 'Active')}</option>
                <option value="archived">{t('admin.positions.statusArchived', 'Archived')}</option>
              </select>
            </label>
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState message={t('admin.positions.empty', 'No positions found.')} />
      ) : (
        <DataTable<Position>
          label={t('admin.positions.title', 'Positions')}
          columns={[
            { key: 'code', label: t('admin.positions.colCode', 'Code'), render: (p) => p.code },
            { key: 'title', label: t('admin.positions.colTitle', 'Title'), render: (p) => p.title },
            {
              key: 'status',
              label: t('admin.positions.colStatus', 'Status'),
              render: (p) =>
                p.status === 'archived'
                  ? t('admin.positions.statusArchived', 'Archived')
                  : t('admin.positions.statusActive', 'Active'),
            },
            {
              key: 'actions',
              label: '',
              render: (p) => (
                <span className="admin-table-actions">
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEditDialog(p)}>
                    {t('admin.positions.edit', 'Edit')}
                  </button>
                  {p.status === 'active' ? (
                    <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleArchive(p)}>
                      {t('admin.positions.archive', 'Archive')}
                    </button>
                  ) : (
                    <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleRestore(p)}>
                      {t('admin.positions.restore', 'Restore')}
                    </button>
                  )}
                </span>
              ),
            },
          ] satisfies Column<Position>[]}
          rows={items}
          keyExtractor={(p) => p.id}
          emptyMessage={t('admin.positions.empty', 'No positions found.')}
        />
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => setShowCreate(false)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.positions.createDialogTitle', 'Add position')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.positions.close', 'Close')} onClick={() => setShowCreate(false)}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleCreate}>
          <FormField id="position-create-code" label={t('admin.positions.fieldCode', 'Code')} required error={createErrors.code}>
            <input
              id="position-create-code"
              value={createForm.code}
              maxLength={60}
              aria-invalid={Boolean(createErrors.code)}
              onChange={(e) => { setCreateForm((prev) => ({ ...prev, code: e.target.value })); setCreateErrors((prev) => clearFieldError(prev, 'code')); }}
            />
          </FormField>
          <FormField id="position-create-title" label={t('admin.positions.fieldTitle', 'Title')} required error={createErrors.title}>
            <input
              id="position-create-title"
              value={createForm.title}
              maxLength={160}
              aria-invalid={Boolean(createErrors.title)}
              onChange={(e) => { setCreateForm((prev) => ({ ...prev, title: e.target.value })); setCreateErrors((prev) => clearFieldError(prev, 'title')); }}
            />
          </FormField>
          <FormField id="position-create-description" label={t('admin.positions.fieldDescription', 'Description')}>
            <textarea
              id="position-create-description"
              value={createForm.description}
              maxLength={1000}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </FormField>
          {createState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{createState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowCreate(false)}>
              {t('admin.positions.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={createState.status === 'saving'}>
              {createState.status === 'saving' ? t('admin.positions.saving', 'Saving...') : t('admin.positions.create', 'Create')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialogRef} className="admin-dialog" onClose={() => setEditPosition(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.positions.editDialogTitle', 'Edit position')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.positions.close', 'Close')} onClick={() => editDialogRef.current?.close()}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdate}>
          <FormField id="position-edit-code" label={t('admin.positions.fieldCode', 'Code')} required error={editErrors.code}>
            <input
              id="position-edit-code"
              value={editForm.code}
              maxLength={60}
              aria-invalid={Boolean(editErrors.code)}
              onChange={(e) => { setEditForm((prev) => ({ ...prev, code: e.target.value })); setEditErrors((prev) => clearFieldError(prev, 'code')); }}
            />
          </FormField>
          <FormField id="position-edit-title" label={t('admin.positions.fieldTitle', 'Title')} required error={editErrors.title}>
            <input
              id="position-edit-title"
              value={editForm.title}
              maxLength={160}
              aria-invalid={Boolean(editErrors.title)}
              onChange={(e) => { setEditForm((prev) => ({ ...prev, title: e.target.value })); setEditErrors((prev) => clearFieldError(prev, 'title')); }}
            />
          </FormField>
          <FormField id="position-edit-description" label={t('admin.positions.fieldDescription', 'Description')}>
            <textarea
              id="position-edit-description"
              value={editForm.description}
              maxLength={1000}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </FormField>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{editState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => editDialogRef.current?.close()}>
              {t('admin.positions.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving' ? t('admin.positions.saving', 'Saving...') : t('admin.positions.save', 'Save')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}
