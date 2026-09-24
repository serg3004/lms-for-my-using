import { useState } from 'react';
import type { TFunction } from 'i18next';
import { getChecklistInstance } from '../shared/api/checklists.js';
import { listChecklistSessions } from '../shared/api/checklistSessions.js';
import type { ChecklistInstanceSummary, ChecklistSessionSummary, ChecklistSessionStatus } from '../shared/api/types.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Badge, PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { checklistResultToAnswer, isChecklistAnswerComplete } from './checklistCompletion.js';

const COLORS = {
  surface: '#ffffff',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
  warning: '#d97706',
  warningSoft: '#fff7e8',
  primarySoft: '#eef2ff',
};

function findResultForItem(results: ChecklistInstanceSummary['results'], itemId: string) {
  return results.find((result) => result.itemId === itemId);
}

type SessionTab = 'scheduled' | 'active' | 'done';

export function tabOf(status: ChecklistSessionStatus): SessionTab {
  if (status === 'scheduled') return 'scheduled';
  if (status === 'in_progress' || status === 'paused') return 'active';
  return 'done';
}

export async function fetchLearnerSessions(): Promise<ChecklistSessionSummary[]> {
  const result = await listChecklistSessions({ pageSize: 100 });
  return result.items;
}

/**
 * PR 298: "Мои обучающие сессии" -- the employee's own workplace-training sessions, additive
 * section inside the existing `/learn/checklists` (no new route/nav-item). `GET /checklist-sessions`
 * already scopes a learner to `{ instance: { userId: user.id } }` via `sessionScope()`, so no extra
 * filter is needed here to get "my sessions". Isolated into its own component (own hooks) so it
 * never shifts LearnerChecklistsPage's existing `useStateAtCalls`-tested hook order.
 */
export function LearnerChecklistSessions({ t }: { t: TFunction }) {
  const [tab, setTab] = useState<SessionTab>('scheduled');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const { state } = useAsyncData<ChecklistSessionSummary[]>(
    fetchLearnerSessions,
    [],
    {
      unauthenticated: t('checklistSessions.learner.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('checklistSessions.learner.loadError', 'Unable to load your training sessions.'),
    },
  );

  if (state.status === 'loading') {
    return <PageState message={t('checklistSessions.learner.loading', 'Loading your training sessions...')} variant="loading" />;
  }
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <PageState title={t('checklistSessions.learner.title', 'My training sessions')} message={state.message} variant="error" />;
  }
  if (state.data.length === 0) return null;

  const openSession = openSessionId ? state.data.find((s) => s.id === openSessionId) : null;
  if (openSession) {
    return <LearnerSessionDetail session={openSession} onBack={() => setOpenSessionId(null)} t={t} />;
  }

  const tabs: { key: SessionTab; label: string }[] = [
    { key: 'scheduled', label: t('checklistSessions.learner.tabs.scheduled', 'Assigned') },
    { key: 'active', label: t('checklistSessions.learner.tabs.active', 'In progress') },
    { key: 'done', label: t('checklistSessions.learner.tabs.done', 'Completed') },
  ];
  const sessions = state.data.filter((s) => tabOf(s.status) === tab);

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ color: COLORS.text, fontSize: 18 }}>{t('checklistSessions.learner.title', 'My training sessions')}</h2>
      <div role="tablist" aria-label={t('checklistSessions.learner.tabs.label', 'Training sessions')} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              border: `1px solid ${tab === key ? COLORS.primary : COLORS.border}`,
              background: tab === key ? COLORS.primarySoft : COLORS.surface,
              color: tab === key ? COLORS.primary : COLORS.text,
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {sessions.length === 0 ? (
        <PageState message={t('checklistSessions.learner.tabEmpty', 'Nothing here yet.')} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {sessions.map((session) => (
            <li
              key={session.id}
              style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18, background: COLORS.surface, cursor: 'pointer', minHeight: 44 }}
              onClick={() => setOpenSessionId(session.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <strong>{session.checklist.title}</strong>
                <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
                  {t(`checklistSessions.status.${session.status}`, session.status)}
                </Badge>
              </div>
              <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 13 }}>
                {t('checklistSessions.learner.observer', 'Observer: {{name}}', { name: `${session.observer.firstName} ${session.observer.lastName}` })}
              </p>
              {session.scheduledAt && (
                <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 12.5 }}>{new Date(session.scheduledAt).toLocaleString()}</p>
              )}
              {session.result.visible && session.result.scored && (
                <p style={{ color: COLORS.muted, margin: '4px 0 0' }}>
                  {t('checklistSessions.learner.percentage', '{{percentage}}%', { percentage: session.result.percentage })}
                  {' '}
                  {session.result.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LearnerSessionDetail({ session, onBack, t }: { session: ChecklistSessionSummary; onBack: () => void; t: TFunction }) {
  const { state } = useAsyncData<ChecklistInstanceSummary>(
    () => getChecklistInstance(session.instanceId),
    [session.instanceId],
    {
      unauthenticated: t('checklistSessions.learner.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('checklistSessions.learner.loadError', 'Unable to load your training sessions.'),
    },
  );

  return (
    <section style={{ marginTop: 32 }}>
      <button
        type="button"
        onClick={onBack}
        style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: '8px 0', minHeight: 44 }}
      >
        ← {t('checklistSessions.learner.backToList', 'My training sessions')}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ color: COLORS.text, margin: '4px 0' }}>{session.checklist.title}</h2>
        <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
          {t(`checklistSessions.status.${session.status}`, session.status)}
        </Badge>
      </div>
      <p style={{ color: COLORS.muted, margin: '4px 0' }}>
        {t('checklistSessions.learner.observer', 'Observer: {{name}}', { name: `${session.observer.firstName} ${session.observer.lastName}` })}
      </p>
      {session.scheduledAt && <p style={{ color: COLORS.muted, margin: '4px 0' }}>{new Date(session.scheduledAt).toLocaleString()}</p>}

      {!session.result.visible ? (
        <p style={{ color: COLORS.muted, marginTop: 16 }}>
          {t('checklistSessions.learner.resultHidden', 'Your result will be visible once the session is completed.')}
        </p>
      ) : (
        <>
          {session.result.scored && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 14,
                padding: '16px 18px',
                background: session.result.passed ? COLORS.successSoft : COLORS.warningSoft,
                color: session.result.passed ? COLORS.success : COLORS.warning,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{session.result.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}</span>
              <strong>{session.result.percentage}%</strong>
            </div>
          )}
          {(session.strengths || session.developmentAreas || session.nextSteps) && (
            <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
              <h3 style={{ color: COLORS.text, fontSize: 14, margin: 0 }}>{t('checklistSessions.learner.feedbackTitle', 'Feedback from your observer')}</h3>
              {session.strengths && (
                <p style={{ margin: 0 }}><strong>{t('checklistSessions.conduct.strengths', 'Strengths')}:</strong> {session.strengths}</p>
              )}
              {session.developmentAreas && (
                <p style={{ margin: 0 }}><strong>{t('checklistSessions.conduct.developmentAreas', 'Development areas')}:</strong> {session.developmentAreas}</p>
              )}
              {session.nextSteps && (
                <p style={{ margin: 0 }}><strong>{t('checklistSessions.conduct.nextSteps', 'Next steps')}:</strong> {session.nextSteps}</p>
              )}
            </div>
          )}
        </>
      )}

      {state.status === 'loaded' && state.data.checklist && (
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          <h3 style={{ color: COLORS.text, fontSize: 14, margin: 0 }}>{t('checklistSessions.learner.criteriaTitle', 'Criteria')}</h3>
          {state.data.checklist.items.map((item) => {
            const result = findResultForItem(state.data.results, item.id);
            const isDone = session.result.visible && isChecklistAnswerComplete(item, state.data.checklist!.scoringMode, checklistResultToAnswer(result));
            return (
              <div
                key={item.id}
                style={{
                  border: `1px solid ${isDone ? COLORS.success : COLORS.border}`,
                  background: isDone ? COLORS.successSoft : COLORS.surface,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <p style={{ fontWeight: 600, margin: 0 }}>{item.text}</p>
                {session.result.visible && result?.comment && (
                  <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '4px 0 0' }}>{result.comment}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
