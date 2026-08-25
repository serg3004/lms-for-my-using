import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { getManagerTeamSummary, type ManagerTeamMember, type ManagerTeamSummary } from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Card, DataTable, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { buildManagerReport, filterReportMembers, type ManagerReportStatus } from './manager-reports/model.js';

function memberName(member: ManagerTeamMember) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}

export function ManagerReportsPage() {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState('all');
  const [status, setStatus] = useState<ManagerReportStatus>('all');
  const { state } = useAsyncData<ManagerTeamSummary>(getManagerTeamSummary, [t], {
    unauthenticated: t('manager.reports.loadError'), error: t('manager.reports.loadError'),
  });

  if (state.status === 'loading') return <ManagerPageLayout><PageState message={t('manager.reports.loading')} variant="loading" /></ManagerPageLayout>;
  if (state.status !== 'loaded') return <ManagerPageLayout><PageState message={t('manager.reports.loadError')} variant="error" /></ManagerPageLayout>;

  const summary = state.data;
  const members = filterReportMembers(summary.members, memberId, status);
  const report = buildManagerReport(summary, members);
  const columns: Column<ManagerTeamMember>[] = [
    { key: 'employee', label: t('manager.reports.employee'), priority: 'primary', render: memberName },
    { key: 'enrollments', label: t('manager.reports.enrollments'), priority: 'secondary', render: (member) => member.activeCoursesCount },
    { key: 'progress', label: t('manager.reports.progress'), priority: 'primary', render: (member) => `${member.completionPercent}%` },
    { key: 'action', label: t('manager.reports.details'), priority: 'secondary', render: (member) => <Link to={`/manager/team?member=${member.userId}`}>{t('manager.reports.openEmployee')}</Link> },
  ];

  return <ManagerPageLayout currentPath="/manager/reports">
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
      <div><div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{t('manager.reports.eyebrow')}</div><h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)' }}>{t('manager.reports.title')}</h1><p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.reports.subtitle')}</p></div>
      <span style={{ padding: '8px 12px', borderRadius: 999, background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', fontSize: 13 }}>{t('manager.reports.period')}</span>
    </header>
    <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16, marginBottom: 20 }}>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>{t('manager.reports.employeeFilter')}<select className="ds-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="all">{t('manager.reports.allEmployees')}</option>{summary.members.map((member) => <option key={member.userId} value={member.userId}>{memberName(member)}</option>)}</select></label>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>{t('manager.reports.statusFilter')}<select className="ds-input" value={status} onChange={(event) => setStatus(event.target.value as ManagerReportStatus)}><option value="all">{t('manager.reports.allStatuses')}</option><option value="good">{t('manager.team.filterGood')}</option><option value="risk">{t('manager.team.filterRisk')}</option></select></label>
    </Card>
    <StatsGrid>
      <StatCard label={t('manager.reports.enrollments')} value={report.enrollments} />
      <StatCard label={t('manager.reports.completion')} value={`${report.completionRate}%`} />
      <StatCard label={t('manager.reports.overdue')} value={report.overdueCount} />
      <StatCard label={t('manager.reports.progress')} value={members.length} />
    </StatsGrid>
    <nav style={{ display: 'flex', gap: 16, margin: '18px 0', flexWrap: 'wrap' }} aria-label={t('manager.reports.drilldown')}><Link to="/manager/team">{t('manager.reports.openTeam')}</Link><Link to="/manager/overdue">{t('manager.reports.openOverdue')}</Link></nav>
    <DataTable columns={columns} density="dense" emptyMessage={t('manager.reports.empty')} keyExtractor={(member) => member.userId} label={t('manager.reports.tableLabel')} rows={report.members} />
  </ManagerPageLayout>;
}
