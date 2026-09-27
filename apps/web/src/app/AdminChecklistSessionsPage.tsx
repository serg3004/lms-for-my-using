import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { formatDate } from '../shared/formatDate.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT, describeChecklistSessionResult } from '../shared/checklistStatus.js';
import { Badge, Button, DataTable, Menu, PageState, Pagination, SearchInput, type Column } from '../shared/ui.js';
import { listChecklistSessionParticipants, listChecklistSessions, repeatChecklistSession, transitionChecklistSession } from '../shared/api/checklistSessions.js';
import type { ChecklistSessionParticipant, ChecklistSessionStatus, ChecklistSessionSummary } from '../shared/api/types.js';
import { ChecklistSessionWizard } from '../features/admin-checklist-sessions/ChecklistSessionWizard.js';
import { ChecklistWorkplaceSettingsDialog } from '../features/admin-checklist-sessions/ChecklistWorkplaceSettingsDialog.js';
import { ReassignObserverDialog } from '../features/admin-checklist-sessions/ReassignObserverDialog.js';
import {
  canCancelSession,
  canReassignObserver,
  canRepeatSession,
  formatParticipantName,
  resolvePeriodScheduledFrom,
  SESSION_PERIODS,
  SESSION_STATUS_TABS,
  type SessionPeriod,
  type SessionStatusTab,
} from '../features/admin-checklist-sessions/domain.js';

const PAGE_SIZE = 20;

type AdminChecklistSessionsData = { sessions: ChecklistSessionSummary[]; total: number };

export function AdminChecklistSessionsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [statusTab, setStatusTab] = useState<SessionStatusTab>('all');
  const [period, setPeriod] = useState<SessionPeriod>('all');
  const [observerFilter, setObserverFilter] = useState('');
  const [observerOptions, setObserverOptions] = useState<ChecklistSessionParticipant[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardReloadPending, setWizardReloadPending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ChecklistSessionSummary | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ChecklistSessionSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    listChecklistSessionParticipants({ role: 'observer', pageSize: 200 })
      .then((result) => setObserverOptions(result.items))
      .catch(() => setObserverOptions([]));
  }, []);

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
        scheduledFrom: resolvePeriodScheduledFrom(period),
        observerId: observerFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      return { sessions: result.items, total: result.total };
    },
    [statusTab, period, observerFilter, search, page, t],
    {
      unauthenticated: t('admin.checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('admin.checklists.sessions.loadError', 'Unable to load sessions.'),
    },
  );

  async function confirmCancel() {
    if (!cancelTarget) return;
    setActionError(null);
    try {
      await transitionChecklistSession(cancelTarget.id, 'cancel', cancelTarget.version, crypto.randomUUID());
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
    {
      key: 'observer',
      label: t('admin.checklists.sessions.columns.observer', 'Observer'),
      render: (row) => (
        <>
          {formatParticipantName(row.observer)}
          {row.observerUnavailableReason && (
            <Badge variant="warning">{t('admin.checklists.sessions.observerUnavailable', 'Unavailable')}</Badge>
          )}
        </>
      ),
      priority: 'primary',
    },
    {
      key: 'scheduledAt',
      label: t('admin.checklists.sessions.columns.scheduledAt', 'Date'),
      // PR 303: rendered in the session's own IANA timezone, not the viewer's browser timezone --
      // otherwise an admin/manager in a different timezone than the session would see a wall-clock
      // time that doesn't match what was actually scheduled. PR 318: numeric DD.MM.YYYY, HH:MM
      // (per-locale digit order) instead of a spelled-out month, matching the prototype.
      render: (row) => (row.scheduledAt
        ? formatDate(row.scheduledAt, undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: row.timezone })
        : '—'),
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
      priority: 'secondary',
    },
    {
      key: 'result',
      label: t('admin.checklists.sessions.columns.result', 'Result'),
      render: (row) => {
        const result = describeChecklistSessionResult(row.result);
        if (result.kind === 'scored') return `${result.percentage}% ${result.passed ? '✓' : '✗'}`;
        if (result.kind === 'notScored') return t('admin.checklists.sessions.notScored', 'Not scored (all skipped)');
        return '—';
      },
      priority: 'tertiary',
    },
    {
      key: 'actions',
      label: t('admin.checklists.sessions.columns.actions', 'Actions'),
      // PR 318: one menu instead of up to 4 separate buttons, so the row never wraps to a second
      // line at 1440px.
      render: (row) => (
        <Menu
          align="end"
          buttonClassName="admin-btn admin-btn--sm"
          label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.rowActions', 'Actions')}</span></>}
        >
          <Link role="menuitem" to={`/admin/checklists/sessions/${row.id}`}>
            {t('admin.checklists.sessions.report', 'Report')}
          </Link>
          {canRepeatSession(row) && (
            <button onClick={() => void repeat(row)} role="menuitem" type="button">
              {t('admin.checklists.sessions.repeat', 'Repeat')}
            </button>
          )}
          {canReassignObserver(row) && (
            <button onClick={() => setReassignTarget(row)} role="menuitem" type="button">
              {t('admin.checklists.sessions.reassignObserver', 'Reassign observer')}
            </button>
          )}
          {canCancelSession(row) && (
            <button onClick={() => setCancelTarget(row)} role="menuitem" type="button">
              {t('admin.checklists.sessions.cancel', 'Cancel')}
            </button>
          )}
        </Menu>
      ),
      priority: 'primary',
    },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={currentUser!}>
      <AdminPageHeader
        eyebrow={t('admin.checklists.sessions.eyebrow', 'Workplace training')}
        title={t('admin.checklists.sessions.pageTitle', 'Training sessions')}
        subtitle={t('admin.checklists.sessions.subtitle', 'Planning, running and tracking training.')}
        action={
          <>
            <Button onClick={() => setSettingsOpen(true)} type="button" variant="secondary">{t('admin.checklists.settings.open', 'Module settings')}</Button>
            <Button onClick={() => setWizardOpen(true)} type="button" variant="primary">+ {t('admin.checklists.sessions.create', 'New session')}</Button>
          </>
        }
      />
      <ChecklistsTabs current="sessions" />
      {actionError && (
        <div className="ui-state ui-state--error admin-inline-banner" role="alert">
          <p>{actionError}</p>
          <button aria-label={t('admin.checklists.close', 'Close')} className="admin-inline-banner__close" onClick={() => setActionError(null)} type="button">×</button>
        </div>
      )}
      <div aria-label={t('admin.checklists.sessions.statusFilter', 'Status')} className="admin-org-tabs" role="tablist">
        {SESSION_STATUS_TABS.map((tab) => (
          <button
            aria-selected={statusTab === tab}
            className="admin-org-tabs__tab"
            key={tab}
            onClick={() => { setStatusTab(tab); setPage(1); }}
            role="tab"
            type="button"
          >
            {tab === 'all' ? t('admin.checklists.allStatuses', 'All statuses') : statusLabels[tab]}
          </button>
        ))}
      </div>
      <div className="admin-card admin-session-filters">
        <FormField id="sessions-filter-period" label={t('admin.checklists.sessions.periodLabel', 'Period')}>
          <select id="sessions-filter-period" onChange={(e) => { setPeriod(e.target.value as SessionPeriod); setPage(1); }} value={period}>
            {SESSION_PERIODS.map((option) => (
              <option key={option} value={option}>{t(`admin.checklists.sessions.period.${option}`, option)}</option>
            ))}
          </select>
        </FormField>
        <FormField id="sessions-filter-observer" label={t('admin.checklists.sessions.observerFilterLabel', 'Observer')}>
          <select id="sessions-filter-observer" onChange={(e) => { setObserverFilter(e.target.value); setPage(1); }} value={observerFilter}>
            <option value="">{t('admin.checklists.sessions.observerFilterAll', 'All observers')}</option>
            {observerOptions.map((observer) => (
              <option key={observer.id} value={observer.id}>{formatParticipantName(observer)}</option>
            ))}
          </select>
        </FormField>
        <div className="admin-form__field admin-session-filters__search">
          <label>{t('admin.checklists.sessions.searchLabel', 'Search')}</label>
          <SearchInput onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t('admin.checklists.sessions.searchPlaceholder', 'Find session')} value={search} />
        </div>
      </div>
      <DataTable
        columns={columns}
        emptyMessage={t('admin.checklists.sessions.empty', 'No sessions match these filters.')}
        keyExtractor={(row) => row.id}
        label={t('admin.checklists.sessions.title', 'Sessions')}
        responsiveDetails={{ label: t('courses.details'), expandLabel: (row) => `${t('courses.details')}: ${row.checklist.title}`, collapseLabel: (row) => `${t('courses.details')}: ${row.checklist.title}` }}
        rows={loadState.data.sessions}
      />
      <Pagination label={t('admin.checklists.sessions.paginationLabel', 'Session pages')} onPage={setPage} page={page} pageSize={PAGE_SIZE} total={loadState.data.total} />
      <ChecklistSessionWizard
        onClose={() => {
          setWizardOpen(false);
          // `load()` briefly flips `loadState.status` back to 'loading', and this page's own
          // loading branch (below) full-page-early-returns while that's true -- unmounting the
          // wizard (and its "Сессии созданы" success screen) mid-display if reloaded immediately
          // in onCreated. Deferring the reload until the wizard has actually closed lets the user
          // see the confirmation instead of it being yanked away by their own successful action.
          if (wizardReloadPending) {
            setWizardReloadPending(false);
            void load();
          }
        }}
        onCreated={() => setWizardReloadPending(true)}
        open={wizardOpen}
        t={t}
      />
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
      <ReassignObserverDialog onClose={() => setReassignTarget(null)} onReassigned={() => void load()} session={reassignTarget} t={t} />
      <ChecklistWorkplaceSettingsDialog onClose={() => setSettingsOpen(false)} open={settingsOpen} t={t} />
    </AdminPageLayout>
  );
}
