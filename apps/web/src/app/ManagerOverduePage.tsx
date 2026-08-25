import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../shared/formatDate.js';

import { getManagerTeamSummary, sendManagerOverdueReminders, type ManagerTeamSummary } from '../shared/api/manager.js';
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  async function remind(assignmentIds: string[]) {
    if (sending || assignmentIds.length === 0) return;
    setSending(true);
    setFeedback(null);
    try {
      const result = await sendManagerOverdueReminders(assignmentIds);
      const message = result.failed > 0
        ? t('manager.overdue.reminderPartial', { sent: result.sent, failed: result.failed })
        : t('manager.overdue.reminderSuccess', { count: result.sent });
      setFeedback({ kind: result.sent > 0 ? 'success' : 'error', message });
      setSelectedKeys(new Set(result.results.filter((item) => item.status === 'failed').map((item) => item.assignmentId)));
    } catch {
      setFeedback({ kind: 'error', message: t('manager.overdue.reminderError') });
    } finally {
      setSending(false);
    }
  }

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
    { key: 'action', label: t('manager.overdue.columnAction'), priority: 'primary', render: (assignment) => <button disabled={sending} onClick={() => { void remind([assignment.assignmentId]); }} type="button">{sending ? t('manager.overdue.sending') : t('manager.overdue.remind')}</button> },
  ];
  return (
    <ManagerPageLayout>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>{t('manager.overdue.eyebrow')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.overdue.title')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.overdue.subtitle')}</p>
      </div>
      {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</div> : null}
      <DataTable batchActions={(selected) => <button disabled={sending} onClick={() => { void remind(selected.map((item) => item.assignmentId)); }} type="button">{sending ? t('manager.overdue.sending') : t('manager.overdue.remindSelected', { count: selected.length })}</button>} columns={columns} density="dense" emptyMessage={t('manager.overdue.empty')} keyExtractor={(assignment) => assignment.assignmentId} label={t('manager.overdue.title')} responsiveDetails={{ label: t('courses.details'), expandLabel: (assignment) => `${t('courses.details')}: ${assignmentName(assignment)}`, collapseLabel: (assignment) => `${t('courses.details')}: ${assignmentName(assignment)}` }} rows={summary.overdueAssignments} selection={{ selectedKeys, onChange: setSelectedKeys, selectAllLabel: t('manager.overdue.selectAll'), rowLabel: (assignment) => t('manager.overdue.selectRow', { target: assignmentName(assignment) }) }} />
    </ManagerPageLayout>
  );
}
