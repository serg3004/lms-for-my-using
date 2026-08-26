import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder.js';
import { ChecklistTable } from '../features/admin-checklists/ChecklistTable.js';
import { CHECKLIST_STATUSES, filterChecklists } from '../features/admin-checklists/domain.js';
import { Button, PageState, SearchInput, Toolbar } from '../shared/ui.js';
import {
  createChecklist,
  deleteChecklist,
  getChecklist,
  listChecklists,
  updateChecklist,
} from '../shared/api/checklists.js';
import type {
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
} from '../shared/api/types.js';
type AdminChecklistsData = { checklists: ChecklistSummary[] };
export function AdminChecklistsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChecklistStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistSummary | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
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
  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteChecklist(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.deleteError', 'Unable to delete checklist.'));
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
  if (selectedId) {
    const checklist = loadState.data.checklists.find((c) => c.id === selectedId);
    if (!checklist) {
      setSelectedId(null);
      return null;
    }
    return (
      <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={currentUser!}>
        <ChecklistBuilder
          checklist={checklist}
          statusLabels={statusLabels}
          scoringModeLabels={scoringModeLabels}
          onBack={() => setSelectedId(null)}
          onReload={() => refreshChecklist(checklist.id)}
          t={t}
        />
      </AdminPageLayout>
    );
  }
  const filtered = filterChecklists(loadState.data.checklists, search, statusFilter);
  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={currentUser!}>
      <AdminPageHeader
        eyebrow={t('admin.checklists.eyebrow', 'Knowledge control')}
        title={t('admin.checklists.title', 'Checklists')}
        subtitle={t('admin.checklists.subtitle', 'Configurable checklists with points or a custom scale, photo confirmation, and automatic or manual grading.')}
        action={
          <Button
            variant="primary"
            type="button"
            onClick={async () => {
              const created = await createChecklist(currentUser!.organizationId, {
                title: t('admin.checklists.newChecklistTitle', 'New checklist'),
                scoringMode: 'sum_points',
                passThreshold: 80,
                requiresReview: false,
              });
              await load();
              setSelectedId(created.id);
            }}
          >
            + {t('admin.checklists.create', 'Create checklist')}
          </Button>
        }
      />
      {statusError && (
        <div className="ui-state ui-state--error admin-inline-banner" role="alert">
          <p>{statusError}</p>
          <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setStatusError(null)}>×</button>
        </div>
      )}
      <Toolbar
        left={<SearchInput value={search} onChange={setSearch} placeholder={t('admin.checklists.searchPlaceholder', 'Find checklist')} />}
        right={
          <select className="admin-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
            <option value="all">{t('admin.checklists.allStatuses', 'All statuses')}</option>
            {CHECKLIST_STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        }
      />
      <ChecklistTable rows={filtered} statusLabels={statusLabels} scoringModeLabels={scoringModeLabels}
        onStatusChange={updateStatus} onEdit={(checklist) => setSelectedId(checklist.id)} onDelete={setDeleteTarget} t={t} />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('admin.checklists.deleteTitle', 'Delete checklist')}
        message={t('admin.checklists.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', { title: deleteTarget?.title ?? '' })}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPageLayout>
  );
}

export { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder.js';
export { applyItemPatch, applyScaleLevelPatch, appendScaleLevel, buildChecklistSettingsPayload, canAssignChecklist, computePreviewResult, createDefaultScale, filterAssignableUsers, filterChecklists, formatUserName, removeItemById, removeScaleLevelAt, resolveUserName } from '../features/admin-checklists/domain.js';
