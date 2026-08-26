import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { formatDate } from '../shared/formatDate.js';
import { getAuditLogFilterOptions, listAuditLog, type AuditLogEntry, type AuditLogFilterOptions } from '../shared/api/auditLog.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { DataTable, PageState, Pagination, Toolbar, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type AdminAuditLogData = {
  entries: AuditLogEntry[];
  total: number;
  pageSize: number;
  filterOptions: AuditLogFilterOptions;
};

function getActorLabel(entry: AuditLogEntry, t: TFunction) {
  if (!entry.actor) return t('admin.auditLog.systemActor', 'System');

  const fullName = [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ');
  return fullName || entry.actor.email;
}

function getActionLabel(action: string, t: TFunction) {
  return t(`admin.auditLog.actions.${action}`, action);
}

export function AdminAuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.auditLog.title', 'Audit log'), href: '/admin/audit-log', isCurrent: true },
  ];

  const { state: loadState } = useAsyncData<AdminAuditLogData>(
    async () => {
      const [result, filterOptions] = await Promise.all([
        listAuditLog({
          page,
          pageSize: 20,
          action: actionFilter || undefined,
          targetType: targetTypeFilter || undefined,
        }),
        getAuditLogFilterOptions(),
      ]);
      return { entries: result.items, total: result.total, pageSize: result.pageSize, filterOptions };
    },
    [page, actionFilter, targetTypeFilter, t],
    {
      unauthenticated: t('admin.auditLog.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.auditLog.loadError', 'Unable to load the audit log. Try again later.'),
    },
  );

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.auditLog.loading', 'Loading audit log...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.auditLog.title', 'Audit log')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const { entries, total, pageSize, filterOptions } = loadState.data;

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      label: t('admin.auditLog.columns.timestamp', 'Time'),
      render: (row) => formatDate(row.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      priority: 'primary',
    },
    {
      key: 'actor',
      label: t('admin.auditLog.columns.actor', 'Actor'),
      render: (row) => getActorLabel(row, t),
      priority: 'primary',
    },
    {
      key: 'action',
      label: t('admin.auditLog.columns.action', 'Action'),
      render: (row) => getActionLabel(row.action, t),
      priority: 'primary',
    },
    {
      key: 'summary',
      label: t('admin.auditLog.columns.summary', 'Details'),
      render: (row) => row.summary,
      priority: 'secondary',
    },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.auditLog.eyebrow', 'Security')}
        title={t('admin.auditLog.title', 'Audit log')}
        subtitle={t('admin.auditLog.subtitle', 'A read-only record of who changed what, and when.')}
      />

      <Toolbar
        left={
          <select
            className="admin-status-select"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            aria-label={t('admin.auditLog.filters.action', 'Action')}
          >
            <option value="">{t('admin.auditLog.filters.allActions', 'All actions')}</option>
            {filterOptions.actions.map((action) => (
              <option key={action} value={action}>{getActionLabel(action, t)}</option>
            ))}
          </select>
        }
        right={
          <select
            className="admin-status-select"
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            aria-label={t('admin.auditLog.filters.targetType', 'Target type')}
          >
            <option value="">{t('admin.auditLog.filters.allTargetTypes', 'All target types')}</option>
            {filterOptions.targetTypes.map((targetType) => (
              <option key={targetType} value={targetType}>{targetType}</option>
            ))}
          </select>
        }
      />

      <DataTable
        label={t('admin.auditLog.title', 'Audit log')}
        columns={columns}
        rows={entries}
        keyExtractor={(row) => row.id}
        emptyMessage={t('admin.auditLog.empty', 'No audit events match these filters.')}
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} label={t('admin.auditLog.paginationLabel', 'Audit log pages')} />
    </AdminPageLayout>
  );
}
