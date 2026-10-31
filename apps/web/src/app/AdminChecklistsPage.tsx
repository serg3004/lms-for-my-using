import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../shared/apiClient.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';
import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder.js';
import { ChecklistTemplateDialog } from '../features/admin-checklists/ChecklistTemplateDialog.js';
import { ChecklistBulkBar, bulkDeleteMessage, bulkResultSummary } from '../features/admin-checklists/ChecklistBulkBar.js';
import { ALL_FOLDERS, FolderTree } from '../features/admin-checklists/FolderTree.js';
import { FolderDialog, MoveToFolderDialog, type FolderDialogTarget } from '../features/admin-checklists/FolderDialogs.js';
import { deleteImpactMessage, folderErrorMessage, folderPath, resolveSelectedFolder, sheetsInFolder } from '../features/admin-checklists/folders.js';
import { ChecklistTable } from '../features/admin-checklists/ChecklistTable.js';
import { CHECKLIST_STATUSES, filterChecklists, isUntouchedDraft } from '../features/admin-checklists/domain.js';
import { Button, PageState, SearchInput, Toolbar } from '../shared/ui.js';
import {
  bulkChecklistAction,
  copyChecklist,
  createChecklist,
  createChecklistFolder,
  deleteChecklist,
  deleteChecklistFolder,
  getChecklist,
  getChecklistFolderDeleteImpact,
  listChecklistFolders,
  listChecklists,
  updateChecklist,
  updateChecklistFolder,
} from '../shared/api/checklists.js';
import type {
  ChecklistBulkAction,
  ChecklistFolder,
  ChecklistBulkResult,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
} from '../shared/api/types.js';
type AdminChecklistsData = { checklists: ChecklistSummary[]; folders?: ChecklistFolder[]; folderTotal?: number };
/**
 * PR 362: the same builder also serves the instructor and the mentor (`variant="observer"`) inside their own
 * layout; the API grants `checklistsCreate` to admin, manager, instructor and mentor alike.
 */
export function AdminChecklistsPage({ variant = 'admin' }: { variant?: 'admin' | 'observer' }) {
  const { t, i18n } = useTranslation();
  const { currentUser } = useSession();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChecklistStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistSummary | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // The draft created by "Create checklist" in this visit. It exists only so the builder has an id;
  // if the author leaves without entering anything it is discarded instead of piling up as "New checklist".
  const freshDraftId = useRef<string | null>(null);
  const newChecklistTitle = t('admin.checklists.newChecklistTitle', 'New checklist');
  const discardFreshDraft = useCallback(async () => {
    const id = freshDraftId.current;
    freshDraftId.current = null;
    if (!id) return;
    try {
      if (isUntouchedDraft(await getChecklist(id), newChecklistTitle)) await deleteChecklist(id);
    } catch {
      // Best effort: a draft that cannot be checked or removed stays as a normal draft.
    }
  }, [newChecklistTitle]);
  const discardRef = useRef(discardFreshDraft);
  discardRef.current = discardFreshDraft;
  useEffect(() => () => { void discardRef.current(); }, []);
  const statusLabels: Record<ChecklistStatus, string> = {
    draft: t('admin.checklists.status.draft', 'Draft'),
    published: t('admin.checklists.status.published', 'Published'),
    archived: t('admin.checklists.status.archived', 'Archived'),
  };
  const scoringModeLabels: Record<ChecklistScoringMode, string> = {
    sum_points: t('admin.checklists.scoring.sumPoints', 'Sum of points'),
    all_required: t('admin.checklists.scoring.allRequired', 'All items required'),
    scale: t('admin.checklists.scoring.scale', 'Custom scale'),
  };
  const { state: loadState, reload: load, mutate } = useAsyncData<AdminChecklistsData>(
    async () => {
      const [checklists, tree] = await Promise.all([
        listChecklists(),
        // The tree is an addition: a failure here must not hide the list itself.
        listChecklistFolders().catch(() => ({ folders: [] as ChecklistFolder[], checklistCount: 0 })),
      ]);
      return { checklists, folders: tree.folders, folderTotal: tree.checklistCount };
    },
    [t],
    {
      unauthenticated: t('admin.checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('admin.checklists.loadError', 'Unable to load checklists.'),
    },
  );
  // Declared after useAsyncData so the smoke spec's positional useState mocks keep their numbering.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // PR 394: bulk selection. It is cleared whenever the search or the status filter changes, so an action never
  // reaches a checklist the user can no longer see.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<ChecklistSummary[] | null>(null);
  const [bulkResult, setBulkResult] = useState<{ result: ChecklistBulkResult; titles: Map<string, string> } | null>(null);
  // PR 396: folders. Collapsed folder ids (everything is expanded by default); the selected folder lives in the URL (`?folder=`).
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [folderDialog, setFolderDialog] = useState<FolderDialogTarget | null>(null);
  const [folderDelete, setFolderDelete] = useState<{ folder: ChecklistFolder; message: string } | null>(null);
  const [moveTargets, setMoveTargets] = useState<ChecklistSummary[] | null>(null);
  // Refreshes a single checklist in place (no full-list reload, no loading flash) — used after
  // an edit made from inside the builder, where a full reload would remount it mid-edit.
  const refreshChecklist = useCallback(async (id: string) => {
    const updated = await getChecklist(id);
    mutate((data) => ({ ...data, checklists: data.checklists.map((c) => (c.id === id ? updated : c)) }));
  }, [mutate]);
  async function updateStatus(checklist: ChecklistSummary, status: ChecklistStatus) {
    setStatusError(null);
    try {
      await updateChecklist(checklist.id, { status });
      await load();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.statusError', 'Unable to update status.'));
    }
  }
  async function runBulk(action: ChecklistBulkAction, targets: ChecklistSummary[], folderId?: string | null) {
    setStatusError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const result = await bulkChecklistAction(action, targets.map((checklist) => checklist.id), folderId);
      setBulkResult({ result, titles: new Map(targets.map((checklist) => [checklist.id, checklist.title])) });
      setSelectedKeys(new Set());
      await load();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.bulk.error', 'Unable to apply the action to the selected checklists.'));
    } finally {
      setBulkBusy(false);
    }
  }
  function requestBulk(action: ChecklistBulkAction, targets: ChecklistSummary[]) {
    if (action === 'delete') setBulkDeleteTargets(targets);
    else void runBulk(action, targets);
  }
  function selectFolder(folderId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (folderId) next.set('folder', folderId);
    else next.delete('folder');
    setSearchParams(next, { replace: true });
    setSelectedKeys(new Set());
  }
  async function submitFolder(values: { name: string; visibleToStaff: boolean }) {
    const target = folderDialog;
    if (!target) return;
    try {
      if (target.kind === 'create') {
        const created = await createChecklistFolder({ name: values.name, parentId: target.parent?.id ?? null, visibleToStaff: values.visibleToStaff });
        if (target.parent) setCollapsedIds((ids) => { const next = new Set(ids); next.delete(target.parent!.id); return next; });
        selectFolder(created.id);
      } else {
        await updateChecklistFolder(target.folder.id, { name: values.name, visibleToStaff: values.visibleToStaff });
      }
    } catch (error) {
      throw new Error(folderErrorMessage(error, t), { cause: error });
    }
    setFolderDialog(null);
    await load();
  }
  async function requestFolderDelete(folder: ChecklistFolder) {
    setStatusError(null);
    try {
      setFolderDelete({ folder, message: deleteImpactMessage(folder.name, await getChecklistFolderDeleteImpact(folder.id), t) });
    } catch (error) {
      setStatusError(folderErrorMessage(error, t));
    }
  }
  async function confirmFolderDelete() {
    const target = folderDelete;
    setFolderDelete(null);
    if (!target) return;
    try {
      await deleteChecklistFolder(target.folder.id);
      setSelectedKeys(new Set());
      await load();
    } catch (error) {
      setStatusError(folderErrorMessage(error, t));
    }
  }
  function changeSearch(value: string) {
    setSearch(value);
    setSelectedKeys(new Set());
  }
  function changeStatusFilter(value: 'all' | ChecklistStatus) {
    setStatusFilter(value);
    setSelectedKeys(new Set());
  }
  async function copy(checklist: ChecklistSummary) {
    setStatusError(null);
    try {
      const copied = await copyChecklist(checklist.id);
      await load();
      setSelectedId(copied.id);
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.copyError', 'Unable to copy the checklist.'));
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteChecklist(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      // The only 400 DELETE returns is "an assignment is still in progress" (sessions run on top of
      // assignments), so explain that and point at archiving instead of surfacing the raw message.
      setStatusError(error instanceof ApiClientError && error.status === 400
        ? t('admin.checklists.deleteBlocked', 'This checklist cannot be deleted while it has assignments or sessions in progress. Finish them or archive the checklist instead.')
        : error instanceof ApiClientError
          ? error.message
          : t('admin.checklists.deleteError', 'Unable to delete checklist.'));
      setDeleteTarget(null);
    }
  }
  if (loadState.status === 'loading') {
    return <main className="admin-state"><PageState message={t('admin.checklists.loading', 'Loading checklists...')} variant="loading" /></main>;
  }

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return <main className="admin-state"><PageState title={t('admin.checklists.title', 'Checklists')} message={loadState.message} variant="error" /></main>;
  }
  const navItems: AdminNavItem[] = [
    { label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' },
    { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments' },
    { label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists', isCurrent: true },
  ];
  const shell = (children: ReactNode) => (variant === 'observer'
    ? <ObserverPageLayout>{children}</ObserverPageLayout>
    : <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={currentUser!}>{children}</AdminPageLayout>);
  if (selectedId) {
    const checklist = loadState.data.checklists.find((c) => c.id === selectedId);
    if (!checklist) {
      setSelectedId(null);
      return null;
    }
    return shell(
      <>
        <ChecklistBuilder
          checklist={checklist}
          statusLabels={statusLabels}
          scoringModeLabels={scoringModeLabels}
          onBack={() => {
            setSelectedId(null);
            void discardFreshDraft().then(() => load());
          }}
          onReload={() => refreshChecklist(checklist.id)}
          t={t}
        />
      </>,
    );
  }
  const folders = loadState.data.folders ?? [];
  const selectedFolderId = resolveSelectedFolder(folders, searchParams.get('folder'));
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const expandedIds = new Set(folders.map((folder) => folder.id).filter((id) => !collapsedIds.has(id)));
  const filtered = filterChecklists(sheetsInFolder(loadState.data.checklists, selectedFolderId), search, statusFilter);
  const crumbs = folderPath(folders, selectedFolderId);
  return shell(
    <>
      <AdminPageHeader
        eyebrow={t('admin.checklists.eyebrow', 'Knowledge control')}
        title={t('admin.checklists.title', 'Checklists')}
        subtitle={t('admin.checklists.subtitle', 'Configurable checklists with points or a custom scale, photo confirmation, and automatic or manual grading.')}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" type="button" onClick={() => setTemplatesOpen(true)}>
            {t('admin.checklists.templates.open', 'From template')}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={async () => {
              const created = await createChecklist(currentUser!.organizationId, {
                title: newChecklistTitle,
                scoringMode: 'sum_points',
                passThreshold: 80,
                requiresReview: false,
              });
              freshDraftId.current = created.id;
              // A sheet created while a folder is open starts in that folder.
              if (selectedFolderId) await updateChecklist(created.id, { folderId: selectedFolderId });
              await load();
              setSelectedId(created.id);
            }}
          >
            + {t('admin.checklists.create', 'Create checklist')}
          </Button>
          </div>
        }
      />
      {variant === 'observer' ? <ObserverSessionsNav current="library" /> : <ChecklistsTabs current="checklists" />}
      {statusError && (
        <div className="ui-state ui-state--error admin-inline-banner" role="alert">
          <p>{statusError}</p>
          <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setStatusError(null)}>×</button>
        </div>
      )}
      <div className="checklist-folders">
        <aside aria-label={t('admin.checklists.folders.treeLabel', 'Checklist folders')} className="admin-section-card checklist-folders__aside">
          <FolderTree
            expandedIds={expandedIds}
            folders={folders}
            onCreateSubfolder={(folder) => setFolderDialog({ kind: 'create', parent: folder })}
            onDelete={(folder) => void requestFolderDelete(folder)}
            onEdit={(folder) => setFolderDialog({ kind: 'edit', folder })}
            onSelect={selectFolder}
            onToggle={(id) => setCollapsedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
            selectedId={selectedFolderId}
            t={t}
            totalCount={loadState.data.folderTotal ?? loadState.data.checklists.length}
          />
        </aside>
        <div className="checklist-folders__main">
          <select aria-label={t('admin.checklists.folders.pick', 'Folder')} className="admin-status-select checklist-folders__picker" onChange={(e) => selectFolder(e.target.value === ALL_FOLDERS ? null : e.target.value)} value={selectedFolderId ?? ALL_FOLDERS}>
            <option value={ALL_FOLDERS}>{t('admin.checklists.folders.all', 'All checklists')}</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folders, folder.id).map((part) => part.name).join(' / ')}</option>)}
          </select>
          <nav aria-label={t('admin.checklists.folders.crumbs', 'Folder path')}>
            <ol className="checklist-folders__crumbs">
              <li>{crumbs.length === 0 ? <b aria-current="page">{t('admin.checklists.folders.all', 'All checklists')}</b> : <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => selectFolder(null)} type="button">{t('admin.checklists.folders.all', 'All checklists')}</button>}</li>
              {crumbs.map((folder, index) => (
                <li key={folder.id}>
                  <span aria-hidden="true">› </span>
                  {index === crumbs.length - 1 ? <b aria-current="page">{folder.name}</b> : <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => selectFolder(folder.id)} type="button">{folder.name}</button>}
                </li>
              ))}
            </ol>
          </nav>
          <Toolbar
            left={<SearchInput value={search} onChange={changeSearch} placeholder={t('admin.checklists.searchPlaceholder', 'Find checklist')} />}
            right={
              <>
                <Button onClick={() => setFolderDialog({ kind: 'create', parent: selectedFolder })} type="button" variant="secondary">{t('admin.checklists.folders.new', 'New folder')}</Button>
                <select aria-label={t('admin.checklists.allStatuses', 'All statuses')} className="admin-status-select" value={statusFilter} onChange={(e) => changeStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
                  <option value="all">{t('admin.checklists.allStatuses', 'All statuses')}</option>
                  {CHECKLIST_STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </>
            }
          />
          {bulkResult && (() => {
            const summary = bulkResultSummary(bulkResult.result, bulkResult.titles, t);
            return (
              <div className="ui-state admin-inline-banner" role="status">
                <p>{summary.headline}</p>
                {summary.skipped.length > 0 && <ul>{summary.skipped.map((line) => <li key={line.id}>{line.text}</li>)}</ul>}
                <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setBulkResult(null)}>×</button>
              </div>
            );
          })()}
          <ChecklistTable rows={filtered} statusLabels={statusLabels} scoringModeLabels={scoringModeLabels} folders={folders}
            onStatusChange={updateStatus} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} onDelete={setDeleteTarget} onMove={(checklist) => setMoveTargets([checklist])}
            selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}
            batchActions={(selected) => <ChecklistBulkBar selected={selected} busy={bulkBusy} onAction={requestBulk} onMove={setMoveTargets} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} t={t} />}
            t={t} />
        </div>
      </div>
      <FolderDialog onClose={() => setFolderDialog(null)} onSubmit={submitFolder} t={t} target={folderDialog} />
      <MoveToFolderDialog
        count={moveTargets?.length ?? 0}
        currentFolderId={moveTargets && moveTargets.length > 0 && moveTargets.every((checklist) => (checklist.folderId ?? null) === (moveTargets[0]!.folderId ?? null)) ? (moveTargets[0]!.folderId ?? null) : null}
        folders={folders}
        onClose={() => setMoveTargets(null)}
        onMove={(folderId) => { const targets = moveTargets ?? []; setMoveTargets(null); void runBulk('move', targets, folderId); }}
        open={moveTargets !== null}
        t={t}
      />
      <ConfirmDialog
        open={folderDelete !== null}
        title={t('admin.checklists.folders.deleteTitle', 'Delete folder')}
        message={folderDelete?.message ?? ''}
        confirmLabel={t('admin.checklists.folders.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void confirmFolderDelete()}
        onCancel={() => setFolderDelete(null)}
      />
      <ChecklistTemplateDialog
        open={templatesOpen}
        locale={(i18n.language ?? 'en').slice(0, 2)}
        onClose={() => setTemplatesOpen(false)}
        onCreated={(created) => { setTemplatesOpen(false); void load().then(() => setSelectedId(created.id)); }}
        t={t}
      />
      <ConfirmDialog
        open={bulkDeleteTargets !== null}
        title={t('admin.checklists.bulk.deleteTitle', 'Delete selected checklists')}
        message={bulkDeleteTargets ? bulkDeleteMessage(bulkDeleteTargets, t) : ''}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => { const targets = bulkDeleteTargets ?? []; setBulkDeleteTargets(null); void runBulk('delete', targets); }}
        onCancel={() => setBulkDeleteTargets(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('admin.checklists.deleteTitle', 'Delete checklist')}
        message={t('admin.checklists.deleteConfirm', 'Delete "{{title}}"? It disappears from the list and can no longer be assigned. Completed results are kept. To just hide it, archive it instead. This cannot be undone.', { title: deleteTarget?.title ?? '' })}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>,
  );
}

export { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder.js';
export { applyItemPatch, applyScaleLevelPatch, appendScaleLevel, buildChecklistSettingsPayload, canAssignChecklist, computePreviewResult, createDefaultScale, filterAssignableUsers, filterChecklists, formatUserName, removeItemById, removeScaleLevelAt, resolveUserName } from '../features/admin-checklists/domain.js';
