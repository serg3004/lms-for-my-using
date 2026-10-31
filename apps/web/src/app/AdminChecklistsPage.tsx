import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';
import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder.js';
import { ChecklistTemplateDialog } from '../features/admin-checklists/ChecklistTemplateDialog.js';
import { ChecklistBulkBar, bulkDeleteMessage, bulkResultSummary } from '../features/admin-checklists/ChecklistBulkBar.js';
import { ChecklistTable } from '../features/admin-checklists/ChecklistTable.js';
import { CHECKLIST_STATUSES, filterChecklists, isUntouchedDraft } from '../features/admin-checklists/domain.js';
import { Button, PageState, SearchInput, Toolbar } from '../shared/ui.js';
import {
  bulkChecklistAction,
  copyChecklist,
  createChecklist,
  deleteChecklist,
  getChecklist,
  listChecklists,
  updateChecklist,
} from '../shared/api/checklists.js';
import type {
  ChecklistBulkAction,
  ChecklistBulkResult,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
} from '../shared/api/types.js';
type AdminChecklistsData = { checklists: ChecklistSummary[] };
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
      const checklists = await listChecklists();
      return { checklists };
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
  async function runBulk(action: ChecklistBulkAction, targets: ChecklistSummary[]) {
    setStatusError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const result = await bulkChecklistAction(action, targets.map((checklist) => checklist.id));
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
  const filtered = filterChecklists(loadState.data.checklists, search, statusFilter);
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
      <Toolbar
        left={<SearchInput value={search} onChange={changeSearch} placeholder={t('admin.checklists.searchPlaceholder', 'Find checklist')} />}
        right={
          <select className="admin-status-select" value={statusFilter} onChange={(e) => changeStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
            <option value="all">{t('admin.checklists.allStatuses', 'All statuses')}</option>
            {CHECKLIST_STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
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
      <ChecklistTable rows={filtered} statusLabels={statusLabels} scoringModeLabels={scoringModeLabels}
        onStatusChange={updateStatus} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} onDelete={setDeleteTarget}
        selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}
        batchActions={(selected) => <ChecklistBulkBar selected={selected} busy={bulkBusy} onAction={requestBulk} onEdit={(checklist) => setSelectedId(checklist.id)} onCopy={copy} t={t} />}
        t={t} />
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
