import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { formatDate } from '../shared/formatDate.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Badge, Button, DataTable, PageState, Pagination, SearchInput, Toolbar, type Column } from '../shared/ui.js';
import { listChecklistSessions, repeatChecklistSession, transitionChecklistSession } from '../shared/api/checklistSessions.js';
import type { ChecklistSessionStatus, ChecklistSessionSummary } from '../shared/api/types.js';
import { ChecklistSessionWizard } from '../features/admin-checklist-sessions/ChecklistSessionWizard.js';
import { canCancelSession, canRepeatSession, formatParticipantName, SESSION_STATUS_TABS, type SessionStatusTab } from '../features/admin-checklist-sessions/domain.js';

const PAGE_SIZE = 20;

type AdminChecklistSessionsData = { sessions: ChecklistSessionSummary[]; total: number };

export function AdminChecklistSessionsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [statusTab, setStatusTab] = useState<SessionStatusTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ChecklistSessionSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusLabels: Record<ChecklistSessionStatus, string> = {
    scheduled: t('admin.checklists.sessions.status.scheduled', 'Scheduled'),
    in_progress: t('admin.checklists.sessions.status.in_progress', 'In progress'),
    paused: t('admin.checklists.sessions.status.paused', 'Paused'),
    completed: t('admin.checklists.sessions.status.completed', 'Completed'),
    cancelled: t('admin.checklists.sessions.status.cancelled', 'Cancelled'),
  };

  const { state: loadState, reload: load } = useAsyncData<AdminChecklistSessionsData>(
    async () => {
      const result = await listChecklistSessions({
        status: statusTab === 'all' ? undefined : statusTab,
        search: search.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      return { sessions: result.items, total: result.total };
    },
    [statusTab, search, page, t],
    {
      unauthenticated: t('admin.checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('admin.checklists.sessions.loadError', 'Unable to load sessions.'),
    },
  );

  async function confirmCancel() {
    if (!cancelTarget) return;
    setActionError(null);
    try {
      await transitionChecklistSession(cancelTarget.id, 'cancel', cancelTarget.version);
      setCancelTarget(null);
      await load();
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : t('admin.checklists.sessions.cancelError', 'Unable to cancel the session.'));
      setCancelTarget(null);
    }
  }

  async function repeat(session: ChecklistSessionSummary) {
    setActionError(null);
    try {
      await repeatChecklistSession(session.id);
      await load();
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : t('admin.checklists.sessions.repeatError', 'Unable to repeat the session.'));
    }
  }

  if (loadState.status === 'loading') {
    return <main className="admin-state"><PageState message={t('admin.checklists.sessions.loading', 'Loading sessions...')} variant="loading" /></main>;
  }

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return <main className="admin-state"><PageState title={t('admin.checklists.sessions.title', 'Sessions')} message={loadState.message} variant="error" /></main>;
  }

  const navItems: AdminNavItem[] = [
    { label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists' },
    { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions', isCurrent: true },
  ];

  const columns: Column<ChecklistSessionSummary>[] = [
    { key: 'checklist', label: t('admin.checklists.sessions.columns.checklist', 'Checklist'), render: (row) => row.checklist.title, priority: 'primary' },
    { key: 'learner', label: t('admin.checklists.sessions.columns.learner', 'Employee'), render: (row) => formatParticipantName(row.learner), priority: 'primary' },
    { key: 'observer', label: t('admin.checklists.sessions.columns.observer', 'Observer'), render: (row) => formatParticipantName(row.observer), priority: 'secondary' },
    {
      key: 'scheduledAt',
      label: t('admin.checklists.sessions.columns.scheduledAt', 'Date'),
      // PR 303: rendered in the session's own IANA timezone, not the viewer's browser timezone --
      // otherwise an admin/manager in a different timezone than the session would see a wall-clock
      // time that doesn't match what was actually scheduled.
      render: (row) => (row.scheduledAt ? formatDate(row.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: row.timezone }) : '—'),
      priority: 'secondary',
    },
    {
      key: 'status',
      label: t('admin.checklists.sessions.columns.status', 'Status'),
      render: (row) => (
        <>
          <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[row.status]}>{statusLabels[row.status]}</Badge>
          {row.overdue && <Badge variant="danger">{t('admin.checklists.sessions.overdue', 'Overdue')}</Badge>}
        </>
      ),
      priority: 'primary',
    },
    {
      key: 'result',
      label: t('admin.checklists.sessions.columns.result', 'Result'),
      render: (row) => (row.result.scored ? `${row.result.percentage}% ${row.result.passed ? '✓' : '✗'}` : '—'),
      priority: 'tertiary',
    },
    {
      key: 'actions',
      label: t('admin.checklists.sessions.columns.actions', 'Actions'),
      render: (row) => (
        <>
          <Link className="admin-btn admin-btn--sm" to={`/admin/checklists/sessions/${row.id}`}>
            {t('admin.checklists.sessions.report', 'Report')}
          </Link>
          {canCancelSession(row) && (
            <button className="admin-btn admin-btn--sm" onClick={() => setCancelTarget(row)} type="button">
              {t('admin.checklists.sessions.cancel', 'Cancel')}
            </button>
          )}
          {canRepeatSession(row) && (
            <button className="admin-btn admin-btn--sm" onClick={() => void repeat(row)} type="button">
              {t('admin.checklists.sessions.repeat', 'Repeat')}
            </button>
          )}
        </>
      ),
      priority: 'primary',
    },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={currentUser!}>
      <AdminPageHeader
        eyebrow={t('admin.checklists.eyebrow', 'Knowledge control')}
        title={t('admin.checklists.sessions.title', 'Sessions')}
        subtitle={t('admin.checklists.sessions.subtitle', 'Schedule and track workplace-training checklist sessions.')}
        action={<Button onClick={() => setWizardOpen(true)} type="button" variant="primary">+ {t('admin.checklists.sessions.create', 'New session')}</Button>}
      />
      <ChecklistsTabs current="sessions" />
      {actionError && (
        <div className="ui-state ui-state--error admin-inline-banner" role="alert">
          <p>{actionError}</p>
          <button aria-label={t('admin.checklists.close', 'Close')} className="admin-inline-banner__close" onClick={() => setActionError(null)} type="button">×</button>
        </div>
      )}
      <Toolbar
        left={<SearchInput onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t('admin.checklists.sessions.searchPlaceholder', 'Find session')} value={search} />}
        right={
          <select
            aria-label={t('admin.checklists.sessions.statusFilter', 'Status')}
            className="admin-status-select"
            onChange={(e) => { setStatusTab(e.target.value as SessionStatusTab); setPage(1); }}
            value={statusTab}
          >
            {SESSION_STATUS_TABS.map((tab) => (
              <option key={tab} value={tab}>{tab === 'all' ? t('admin.checklists.allStatuses', 'All statuses') : statusLabels[tab]}</option>
            ))}
          </select>
        }
      />
      <DataTable
        columns={columns}
        emptyMessage={t('admin.checklists.sessions.empty', 'No sessions match these filters.')}
        keyExtractor={(row) => row.id}
        label={t('admin.checklists.sessions.title', 'Sessions')}
        rows={loadState.data.sessions}
      />
      <Pagination label={t('admin.checklists.sessions.paginationLabel', 'Session pages')} onPage={setPage} page={page} pageSize={PAGE_SIZE} total={loadState.data.total} />
      <ChecklistSessionWizard onClose={() => setWizardOpen(false)} onCreated={() => void load()} open={wizardOpen} t={t} />
      <ConfirmDialog
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        confirmLabel={t('admin.checklists.sessions.cancel', 'Cancel')}
        message={t('admin.checklists.sessions.cancelConfirm', 'Cancel this session? This action cannot be undone.')}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => void confirmCancel()}
        open={cancelTarget !== null}
        title={t('admin.checklists.sessions.cancelTitle', 'Cancel session')}
        variant="danger"
      />
    </AdminPageLayout>
  );
}
