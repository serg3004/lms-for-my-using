import { useTranslation } from 'react-i18next';
import { formatDate } from '../shared/formatDate.js';

import { getManagerTeamSummary, type ManagerTeamSummary } from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Badge, DataTable, PageState, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ManagerOverdueData = { summary: ManagerTeamSummary };

export function ManagerOverduePage() {
  const { t } = useTranslation();
  const { state } = useAsyncData<ManagerOverdueData>(
    async () => ({ summary: await getManagerTeamSummary() }),
    [t],
    { unauthenticated: t('manager.overdue.loadError'), error: t('manager.overdue.loadError') },
  );

  if (state.status === 'loading') return <ManagerPageLayout><PageState message={t('manager.overdue.loading')} variant="loading" /></ManagerPageLayout>;
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <ManagerPageLayout><PageState message={t('manager.overdue.loadError')} variant="error" /></ManagerPageLayout>;
  }

  const { summary } = state.data;
  type OverdueAssignment = ManagerTeamSummary['overdueAssignments'][number];
  const assignmentName = (assignment: OverdueAssignment) => {
    const member = summary.members.find((item) => item.userId === assignment.userId);
    return member
      ? [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email
      : assignment.groupName ?? assignment.userId ?? t('manager.overdue.unknownTarget');
  };
  const columns: Column<OverdueAssignment>[] = [
    { key: 'employee', label: t('manager.overdue.columnEmployee'), priority: 'primary', render: assignmentName },
    { key: 'course', label: t('manager.overdue.columnCourse'), priority: 'primary', render: (assignment) => assignment.courseTitle },
    { key: 'dueDate', label: t('manager.overdue.columnDueDate'), priority: 'secondary', render: (assignment) => formatDate(assignment.dueAt) },
    { key: 'status', label: t('manager.overdue.columnStatus'), priority: 'secondary', render: () => <Badge variant="overdue">{t('manager.overdue.status')}</Badge> },
  ];
  return (
    <ManagerPageLayout>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>{t('manager.overdue.eyebrow')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.overdue.title')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.overdue.subtitle')}</p>
      </div>
      <DataTable columns={columns} density="dense" emptyMessage={t('manager.overdue.empty')} keyExtractor={(assignment) => assignment.assignmentId} label={t('manager.overdue.title')} responsiveDetails={{ label: t('courses.details'), expandLabel: (assignment) => `${t('courses.details')}: ${assignmentName(assignment)}`, collapseLabel: (assignment) => `${t('courses.details')}: ${assignmentName(assignment)}` }} rows={summary.overdueAssignments} />
    </ManagerPageLayout>
  );
}
