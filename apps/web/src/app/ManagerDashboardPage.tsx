import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { createAssignment, getCurrentUser, listCourses, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import { getManagerTeamSummary, type ManagerTeamSummary } from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Card, PageState, ProgressBar, StatCard, StatsGrid } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ManagerDashboardData = { user: CurrentUser; summary: ManagerTeamSummary };

function AssignTrainingModal({
  organizationId,
  members,
  onClose,
  onAssigned,
}: {
  organizationId: string;
  members: ManagerTeamSummary['members'];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [userId, setUserId] = useState(members[0]?.userId ?? '');
  const [courseId, setCourseId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');

  useEffect(() => {
    let isMounted = true;
    void listCourses({ pageSize: 100 }).then((result) => {
      if (isMounted) {
        setCourses(result.items);
        setCourseId((current) => current || (result.items[0]?.id ?? ''));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId || !courseId) return;

    setStatus('submitting');
    try {
      await createAssignment({
        organizationId,
        courseId,
        userId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      onAssigned();
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('manager.dashboard.assign.title')}>
      <Card className="modal-card">
        <h3 style={{ margin: '0 0 16px' }}>{t('manager.dashboard.assign.title')}</h3>
        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'grid', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '6px' }}>
            <span>{t('manager.dashboard.assign.employeeLabel')}</span>
            <select className="ds-input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span>{t('manager.dashboard.assign.courseLabel')}</span>
            <select className="ds-input" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '6px' }}>
            <span>{t('manager.dashboard.assign.dueDateLabel')}</span>
            <input className="ds-input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>

          {status === 'error' ? <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{t('manager.dashboard.assign.error')}</p> : null}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="ds-button ds-button--secondary ds-button--sm" onClick={onClose}>
              {t('manager.dashboard.assign.cancel')}
            </button>
            <button type="submit" className="ds-button ds-button--primary ds-button--sm" disabled={status === 'submitting' || !userId || !courseId}>
              {t('manager.dashboard.assign.submit')}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function ManagerDashboardPage() {
  const { t } = useTranslation();
  const { state, mutate } = useAsyncData<ManagerDashboardData>(
    async () => {
      const [user, summary] = await Promise.all([getCurrentUser(), getManagerTeamSummary()]);
      return { user, summary };
    },
    [t],
    { unauthenticated: t('manager.dashboard.loadError'), error: t('manager.dashboard.loadError') },
  );
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignedMessage, setAssignedMessage] = useState(false);

  async function refreshSummary() {
    const summary = await getManagerTeamSummary();
    mutate((data) => ({ ...data, summary }));
    setIsAssignOpen(false);
    setAssignedMessage(true);
  }

  if (state.status === 'loading') {
    return (
      <ManagerPageLayout>
        <PageState message={t('manager.dashboard.loading')} variant="loading" />
      </ManagerPageLayout>
    );
  }

  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return (
      <ManagerPageLayout>
        <PageState message={t('manager.dashboard.loadError')} variant="error" />
      </ManagerPageLayout>
    );
  }

  const { user, summary } = state.data;

  return (
    <ManagerPageLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
            {t('manager.dashboard.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.dashboard.title')}</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.dashboard.subtitle', { name: user.firstName })}</p>
        </div>
        <button type="button" className="ds-button ds-button--primary" onClick={() => setIsAssignOpen(true)} disabled={summary.members.length === 0}>
          {t('manager.dashboard.assignButton')}
        </button>
      </div>

      {assignedMessage ? (
        <p role="status" style={{ color: '#0f9f6e', marginBottom: '16px' }}>{t('manager.dashboard.assign.success')}</p>
      ) : null}

      <StatsGrid>
        <StatCard label={t('manager.dashboard.stats.members')} value={summary.membersCount} />
        <StatCard label={t('manager.dashboard.stats.completion')} value={`${summary.completionRate}%`} />
        <StatCard label={t('manager.dashboard.stats.dueThisWeek')} value={summary.dueThisWeekCount} />
        <StatCard label={t('manager.dashboard.stats.attention')} value={summary.overdueCount} />
      </StatsGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '16px', marginTop: '20px' }}>
        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: '17px' }}>{t('manager.dashboard.teamProgressTitle')}</h3>
          <ProgressBar value={summary.completionRate} max={100} label={t('manager.dashboard.stats.completion')} />
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: '17px' }}>{t('manager.dashboard.upcomingTitle')}</h3>
          {summary.upcomingDeadlines.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{t('manager.dashboard.upcomingEmpty')}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '10px' }}>
              {summary.upcomingDeadlines.map((item, index) => {
                const member = summary.members.find((m) => m.userId === item.userId);
                const name = member ? [member.firstName, member.lastName].filter(Boolean).join(' ') : '';
                return (
                  <li key={`${item.userId}-${index}`} style={{ fontSize: '14px' }}>
                    {t('manager.dashboard.upcomingItem', { course: item.courseTitle, name, date: new Date(item.dueAt).toLocaleDateString() })}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 14px', fontSize: '17px' }}>{t('manager.dashboard.recentTitle')}</h3>
          {summary.avgTeamScore === null ? (
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{t('manager.dashboard.recentEmpty')}</p>
          ) : (
            <p style={{ margin: 0 }}>{t('manager.dashboard.recentScore', { score: summary.avgTeamScore })}</p>
          )}
        </Card>
      </div>

      {isAssignOpen ? (
        <AssignTrainingModal
          organizationId={user.organizationId}
          members={summary.members}
          onClose={() => setIsAssignOpen(false)}
          onAssigned={() => { void refreshSummary(); }}
        />
      ) : null}
    </ManagerPageLayout>
  );
}
