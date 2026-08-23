import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getManagerTeamSummary, type ManagerTeamSummary } from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Badge, PageState } from '../shared/ui.js';

type LoadState = { status: 'loading' } | { status: 'loaded'; summary: ManagerTeamSummary } | { status: 'error' };

export function ManagerOverduePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;
    void getManagerTeamSummary()
      .then((summary) => { if (isMounted) setState({ status: 'loaded', summary }); })
      .catch(() => { if (isMounted) setState({ status: 'error' }); });
    return () => { isMounted = false; };
  }, []);

  if (state.status === 'loading') return <ManagerPageLayout><PageState message={t('manager.overdue.loading')} variant="loading" /></ManagerPageLayout>;
  if (state.status === 'error') return <ManagerPageLayout><PageState message={t('manager.overdue.loadError')} variant="error" /></ManagerPageLayout>;

  const { summary } = state;
  return (
    <ManagerPageLayout>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>{t('manager.overdue.eyebrow')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.overdue.title')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.overdue.subtitle')}</p>
      </div>
      <div className="admin-table-wrap"><table>
        <thead><tr><th>{t('manager.overdue.columnEmployee')}</th><th>{t('manager.overdue.columnCourse')}</th><th>{t('manager.overdue.columnDueDate')}</th><th>{t('manager.overdue.columnStatus')}</th></tr></thead>
        <tbody>
          {summary.overdueAssignments.map((assignment) => {
            const member = summary.members.find((item) => item.userId === assignment.userId);
            const name = member ? [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email : assignment.userId;
            return <tr key={assignment.assignmentId}><td>{name}</td><td>{assignment.courseTitle}</td><td>{new Date(assignment.dueAt).toLocaleDateString()}</td><td><Badge variant="overdue">{t('manager.overdue.status')}</Badge></td></tr>;
          })}
          {summary.overdueAssignments.length === 0 ? <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>{t('manager.overdue.empty')}</td></tr> : null}
        </tbody>
      </table></div>
    </ManagerPageLayout>
  );
}
