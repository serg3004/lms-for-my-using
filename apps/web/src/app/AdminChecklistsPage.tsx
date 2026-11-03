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
import { ChecklistCreateMenu } from '../features/admin-checklists/ChecklistCreateMenu.js';
import { ChecklistTemplateDialog } from '../features/admin-checklists/ChecklistTemplateDialog.js';
import { ChecklistBulkBar, bulkDeleteMessage, bulkResultSummary, folderBulkResultSummary, mergeBulkReports, selectionDeleteMessage, type BulkReport } from '../features/admin-checklists/ChecklistBulkBar.js';
import { FolderDialog, MoveToFolderDialog, type FolderDialogTarget } from '../features/admin-checklists/FolderDialogs.js';
import { canAddSubfolder, deleteImpactMessage, folderErrorMessage, folderPath, libraryContents, resolveSelectedFolder } from '../features/admin-checklists/folders.js';
import { ChecklistTable } from '../features/admin-checklists/ChecklistTable.js';
import { CHECKLIST_STATUSES, filterChecklists, isUntouchedDraft } from '../features/admin-checklists/domain.js';
import { Button, PageState, SearchInput, Toolbar, type DataTableSort } from '../shared/ui.js';
import {
  bulkChecklistAction,
  bulkChecklistFolderAction,
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
  const [bulkResult, setBulkResult] = useState<BulkReport | null>(null);
  // PR 396: folders. Collapsed folder ids (everything is expanded by default); the selected folder lives in the URL (`?folder=`).
  const [searchParams, setSearchParams] = useSearchParams();
  // PR 404: usage links open only a sheet already returned by the permission-filtered library.
  useEffect(() => {
    const target = searchParams.get('checklistId');
    if (!target || loadState.status !== 'loaded') return;
    if (loadState.data.checklists.some((checklist) => checklist.id === target)) setSelectedId(target);
    const next = new URLSearchParams(searchParams); next.delete('checklistId'); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadState]);
  // Without a chosen sort, folders go by name and checklists keep the server order (newest first).
  const [sort, setSort] = useState<DataTableSort | undefined>(undefined);
  const [folderDialog, setFolderDialog] = useState<FolderDialogTarget | null>(null);
  const [folderDelete, setFolderDelete] = useState<{ folder: ChecklistFolder; message: string } | null>(null);
  // PR 410: what the "Move to folder…" dialog moves: checklists and/or folders (one row, a selection, or a mix).
  const [moveTargets, setMoveTargets] = useState<{ sheets: ChecklistSummary[]; folders: ChecklistFolder[] } | null>(null);
  const [selectionDelete, setSelectionDelete] = useState<{ sheets: ChecklistSummary[]; folders: ChecklistFolder[]; message: string } | null>(null);
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
      setBulkResult(bulkResultSummary(result, new Map(targets.map((checklist) => [checklist.id, checklist.title])), t));
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
    // PR 408: every level is a history entry, so the browser's Back button goes one folder up.
    setSearchParams(next);
    setSelectedKeys(new Set());
  }
  async function submitFolder(values: { name: string; visibleToStaff: boolean }) {
    const target = folderDialog;
    if (!target) return;
    try {
      if (target.kind === 'create') {
        // PR 409: the new folder appears as a row of the open folder; the user stays where they are.
        await createChecklistFolder({ name: values.name, parentId: target.parent?.id ?? null, visibleToStaff: values.visibleToStaff });
      } else {
        await updateChecklistFolder(target.folder.id, { name: values.name, visibleToStaff: values.visibleToStaff });
        setSelectedKeys(new Set());
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
  /** PR 410: moves the selected checklists and folders; checklists go first, folders second, one report. */
  async function runMove(selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }, parentId: string | null) {
    setStatusError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const reports: BulkReport[] = [];
      const counts: Array<{ done: number; skipped: number }> = [];
      if (selection.sheets.length > 0) {
        const result = await bulkChecklistAction('move', selection.sheets.map((checklist) => checklist.id), parentId);
        reports.push(bulkResultSummary(result, new Map(selection.sheets.map((checklist) => [checklist.id, checklist.title])), t));
        counts.push(result);
      }
      if (selection.folders.length > 0) {
        const result = await bulkChecklistFolderAction('move', selection.folders.map((folder) => folder.id), parentId);
        reports.push(folderBulkResultSummary(result, new Map(selection.folders.map((folder) => [folder.id, folder.name])), t));
        counts.push(result);
      }
      setBulkResult(reports.length === 1 ? reports[0]! : mergeBulkReports(reports, counts, t));
      setSelectedKeys(new Set());
      await load();
    } catch (error) {
      setStatusError(folderErrorMessage(error, t));
    } finally {
      setBulkBusy(false);
    }
  }
  /** PR 410: one confirmation with the numbers up front for deleting a selection that contains folders. */
  async function requestSelectionDelete(selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) {
    setStatusError(null);
    try {
      // A selected folder inside another selected folder is deleted with it, so only the top-most ones are counted.
      const ids = new Set(selection.folders.map((folder) => folder.id));
      const topMost = selection.folders.filter((folder) => !folderPath(folders, folder.id).slice(0, -1).some((ancestor) => ids.has(ancestor.id)));
      const impacts = await Promise.all(topMost.map((folder) => getChecklistFolderDeleteImpact(folder.id)));
      const impact = {
        folders: impacts.reduce((sum, item) => sum + item.folders, 0),
        checklists: impacts.reduce((sum, item) => sum + item.checklists, 0),
        movedToDraft: impacts.flatMap((item) => item.movedToDraft),
      };
      setSelectionDelete({ ...selection, message: selectionDeleteMessage(impact, selection.sheets.length, t) });
    } catch (error) {
      setStatusError(folderErrorMessage(error, t));
    }
  }
  async function confirmSelectionDelete() {
    const target = selectionDelete;
    setSelectionDelete(null);
    if (!target) return;
    setStatusError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const reports: BulkReport[] = [];
      const counts: Array<{ done: number; skipped: number }> = [];
      if (target.sheets.length > 0) {
        const result = await bulkChecklistAction('delete', target.sheets.map((checklist) => checklist.id));
        reports.push(bulkResultSummary(result, new Map(target.sheets.map((checklist) => [checklist.id, checklist.title])), t));
        counts.push(result);
      }
      const result = await bulkChecklistFolderAction('delete', target.folders.map((folder) => folder.id));
      const report = folderBulkResultSummary(result, new Map(target.folders.map((folder) => [folder.id, folder.name])), t);
      if (result.summary && result.summary.movedToDraft.length > 0) {
        report.skipped.push({ id: 'moved-to-draft', text: t('admin.checklists.bulk.folderMovedToDraft', 'Not deleted, moved to drafts at the root (assignments in progress): {{titles}}', { titles: result.summary.movedToDraft.map((sheet) => `«${sheet.title}»`).join(', ') }) });
      }
      reports.push(report);
      counts.push(result);
      setBulkResult(reports.length === 1 ? reports[0]! : mergeBulkReports(reports, counts, t));
      setSelectedKeys(new Set());
      await load();
    } catch (error) {
      setStatusError(folderErrorMessage(error, t));
    } finally {
      setBulkBusy(false);
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
  /** PR 409: "+ Create > Checklist": the draft is created straight in the open folder and opened in the editor. */
  async function createInOpenFolder() {
    setStatusError(null);
    try {
      const created = await createChecklist(currentUser!.organizationId, {
        title: newChecklistTitle,
        scoringMode: 'sum_points',
        passThreshold: 80,
        requiresReview: false,
        folderId: selectedFolderId,
      });
      freshDraftId.current = created.id;
      await load();
      setSelectedId(created.id);
    } catch (error) {
      setStatusError(error instanceof ApiClientError && error.status === 404
        ? t('admin.checklists.folders.errorGone', 'The folder no longer exists or is not available to you. Refresh the page.')
        : error instanceof ApiClientError ? error.message : t('admin.checklists.createError', 'Unable to create the checklist.'));
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
  const requestedFolder = searchParams.get('folder');
  const selectedFolderId = resolveSelectedFolder(folders, requestedFolder);
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  // A link to a folder that is gone or hidden opens the root and says so (the address is cleaned up once).
  const staleFolder = requestedFolder !== null && selectedFolderId === null;
  const searching = search.trim().length > 0;
  const contents = libraryContents(folders, loadState.data.checklists, selectedFolderId);
  // PR 408: with a search text the whole library is searched and shown flat (with the folder path); otherwise only the open folder.
  const sheetPool = searching ? loadState.data.checklists : contents.sheets;
  const direction = sort?.direction === 'descending' ? -1 : 1;
  const filteredSheets = filterChecklists(sheetPool, search, statusFilter);
  const sortedSheets = !sort ? filteredSheets : [...filteredSheets].sort((a, b) => sort.key === 'createdAt'
    ? direction * a.createdAt.localeCompare(b.createdAt)
    : direction * a.title.localeCompare(b.title));
  const shownFolders = searching ? [] : [...contents.folders].sort((a, b) => sort?.key === 'createdAt'
    ? direction * a.createdAt.localeCompare(b.createdAt)
    : direction * a.name.localeCompare(b.name));
  const crumbs = folderPath(folders, selectedFolderId);
  const emptyMessage = searching
    ? t('admin.checklists.folders.notFound', 'Nothing found.')
    : t('admin.checklists.folders.empty', 'This folder is empty. Create a folder or a checklist.');
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
          <ChecklistCreateMenu
            canCreateFolder={canAddSubfolder(folders, selectedFolderId)}
            onCreateFolder={() => setFolderDialog({ kind: 'create', parent: selectedFolder })}
            onCreateChecklist={() => void createInOpenFolder()}
            t={t}
          />
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
      <div className="checklist-library">
        <div className="checklist-folders__main">
          {staleFolder && <div className="ui-state admin-inline-banner" role="status"><p>{t('admin.checklists.folders.staleFolder', 'The folder is hidden or deleted. Showing the root.')}</p></div>}
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
                <select aria-label={t('admin.checklists.allStatuses', 'All statuses')} className="admin-status-select" value={statusFilter} onChange={(e) => changeStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
                  <option value="all">{t('admin.checklists.allStatuses', 'All statuses')}</option>
                  {CHECKLIST_STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </>
            }
          />
          {bulkResult && (
            <div className="ui-state admin-inline-banner" role="status">
              <p>{bulkResult.headline}</p>
              {bulkResult.skipped.length > 0 && <ul>{bulkResult.skipped.map((line) => <li key={line.id}>{line.text}</li>)}</ul>}
              <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setBulkResult(null)}>×</button>
            </div>
          )}
          <ChecklistTable rows={sortedSheets} childFolders={shownFolders} allSheets={loadState.data.checklists} showFolderPath={searching} statusLabels={statusLabels} scoringModeLabels={scoringModeLabels} folders={folders}
            onStatusChange={updateStatus} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} onDelete={setDeleteTarget} onMove={(checklist) => setMoveTargets({ sheets: [checklist], folders: [] })}
            selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}
            onMoveSelection={setMoveTargets} onDeleteSelection={(selection) => void requestSelectionDelete(selection)}
            onCreateFolder={() => setFolderDialog({ kind: 'create', parent: selectedFolder })} onCreateChecklist={() => void createInOpenFolder()} canCreateFolder={canAddSubfolder(folders, selectedFolderId)}
            onOpenFolder={(folder) => selectFolder(folder.id)} onRenameFolder={(folder) => setFolderDialog({ kind: 'edit', folder })} onMoveFolder={(folder) => setMoveTargets({ sheets: [], folders: [folder] })} onDeleteFolder={(folder) => void requestFolderDelete(folder)}
            sort={sort} onSortChange={setSort} emptyMessage={emptyMessage}
            batchActions={({ sheets, folders: pickedFolders }) => <ChecklistBulkBar selected={sheets} selectedFolders={pickedFolders} busy={bulkBusy} onAction={requestBulk} onMove={setMoveTargets} onRenameFolder={(folder) => setFolderDialog({ kind: 'edit', folder })} onDeleteSelection={(selection) => void requestSelectionDelete(selection)} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} t={t} />}
            t={t} />
        </div>
      </div>
      <FolderDialog onClose={() => setFolderDialog(null)} onSubmit={submitFolder} t={t} target={folderDialog} />
      <MoveToFolderDialog
        count={(moveTargets?.sheets.length ?? 0) + (moveTargets?.folders.length ?? 0)}
        title={moveTargets && moveTargets.folders.length > 0
          ? (moveTargets.sheets.length === 0 && moveTargets.folders.length === 1
            ? t('admin.checklists.folders.moveFolderTitle', 'Move the folder "{{name}}"', { name: moveTargets.folders[0]!.name })
            : t('admin.checklists.folders.moveItemsTitle', 'Move the selected items ({{count}}) to a folder', { count: moveTargets.sheets.length + moveTargets.folders.length }))
          : undefined}
        excludeFolderIds={moveTargets?.folders.map((folder) => folder.id)}
        currentFolderId={(() => {
          const parents = [...(moveTargets?.sheets ?? []).map((checklist) => checklist.folderId ?? null), ...(moveTargets?.folders ?? []).map((folder) => folder.parentId)];
          return parents.length > 0 && parents.every((parent) => parent === parents[0]) ? parents[0]! : null;
        })()}
        folders={folders}
        onRenameFolder={(folder) => setFolderDialog({ kind: 'edit', folder })}
        onCreateFolder={(parent) => setFolderDialog({ kind: 'create', parent })}
        onClose={() => setMoveTargets(null)}
        onMove={(parentId) => { const target = moveTargets; setMoveTargets(null); if (target) void runMove(target, parentId); }}
        open={moveTargets !== null}
        t={t}
      />
      <ConfirmDialog
        open={selectionDelete !== null}
        title={t('admin.checklists.bulk.deleteSelectionTitle', 'Delete the selection')}
        message={selectionDelete?.message ?? ''}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void confirmSelectionDelete()}
        onCancel={() => setSelectionDelete(null)}
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
        folderId={selectedFolderId}
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
