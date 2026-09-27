import { useState, type CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import { getChecklistInstance } from '../shared/api/checklists.js';
import { listChecklistSessions } from '../shared/api/checklistSessions.js';
import { formatDate } from '../shared/formatDate.js';
import type { ChecklistInstanceSummary, ChecklistSessionSummary, ChecklistSessionStatus } from '../shared/api/types.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT, describeChecklistSessionResult } from '../shared/checklistStatus.js';
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

/**
 * PR 320: the "previous feedback" card sources its data from the already-loaded session list --
 * no extra API call. Only a `completed` session with a visible result can carry real feedback (the
 * `after_completion` masking rule already guarantees `result.visible` before completion), so this
 * mirrors that same rule rather than introducing a second one.
 */
function latestFeedbackSession(sessions: ChecklistSessionSummary[]): ChecklistSessionSummary | null {
  const candidates = sessions.filter(
    (session) => session.status === 'completed' && session.result.visible && (session.strengths || session.developmentAreas),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, session) => (new Date(session.updatedAt) > new Date(latest.updatedAt) ? session : latest));
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
  const feedbackSession = latestFeedbackSession(state.data);

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ color: COLORS.text, fontSize: 18 }}>{t('checklistSessions.learner.title', 'My training sessions')}</h2>
      <div
        role="tablist"
        aria-label={t('checklistSessions.learner.tabs.label', 'Training sessions')}
        style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16, overflowX: 'auto' }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              border: 'none',
              borderBottom: `2px solid ${tab === key ? COLORS.primary : 'transparent'}`,
              background: 'none',
              color: tab === key ? COLORS.primary : COLORS.muted,
              padding: '9px 12px 11px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
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
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'hidden', background: COLORS.surface }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={tableHeadStyle}>{t('checklistSessions.learner.columns.session', 'Session')}</th>
                <th style={tableHeadStyle}>{t('checklistSessions.learner.columns.observer', 'Observer')}</th>
                <th style={tableHeadStyle}>{t('checklistSessions.learner.columns.date', 'Date')}</th>
                <th style={tableHeadStyle}>{t('checklistSessions.learner.columns.result', 'Result')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  onClick={() => setOpenSessionId(session.id)}
                  style={{ cursor: 'pointer', borderTop: `1px solid ${COLORS.border}`, minHeight: 44 }}
                >
                  <td style={tableCellStyle}><strong>{session.checklist.title}</strong></td>
                  <td style={tableCellStyle}>{`${session.observer.firstName} ${session.observer.lastName}`}</td>
                  <td style={{ ...tableCellStyle, color: COLORS.muted, fontSize: 12.5 }}>
                    {session.scheduledAt ? formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: session.timezone }) : '—'}
                  </td>
                  <td style={tableCellStyle}>{renderResultCell(session, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {feedbackSession && (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15, marginTop: 12, background: COLORS.surface }}>
          <strong style={{ fontSize: 13 }}>{t('checklistSessions.learner.previousFeedback', 'Previous feedback')}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 10 }}>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 12 }}>{t('checklistSessions.conduct.strengths', 'Strengths')}</div>
              <strong style={{ fontSize: 13 }}>{feedbackSession.strengths || '—'}</strong>
            </div>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 12 }}>{t('checklistSessions.conduct.developmentAreas', 'Development areas')}</div>
              <strong style={{ fontSize: 13 }}>{feedbackSession.developmentAreas || '—'}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const tableHeadStyle: CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, color: COLORS.muted, fontWeight: 600 };
const tableCellStyle: CSSProperties = { padding: '12px 14px', fontSize: 13, color: COLORS.text };

function renderResultCell(session: ChecklistSessionSummary, t: TFunction) {
  if (!session.result.visible) {
    return (
      <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
        {t(`checklistSessions.status.${session.status}`, session.status)}
      </Badge>
    );
  }
  const result = describeChecklistSessionResult(session.result);
  if (result.kind === 'scored') {
    return (
      <Badge variant={result.passed ? 'success' : 'warning'}>
        {t('checklistSessions.learner.percentage', '{{percentage}}%', { percentage: result.percentage })}
      </Badge>
    );
  }
  if (result.kind === 'notScored') {
    return <Badge variant="neutral">{t('checklistSessions.learner.notScored', 'Not scored (all skipped)')}</Badge>;
  }
  return (
    <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
      {t(`checklistSessions.status.${session.status}`, session.status)}
    </Badge>
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
      {session.scheduledAt && <p style={{ color: COLORS.muted, margin: '4px 0' }}>{formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: session.timezone })}</p>}

      {!session.result.visible ? (
        <p style={{ color: COLORS.muted, marginTop: 16 }}>
          {t('checklistSessions.learner.resultHidden', 'Your result will be visible once the session is completed.')}
        </p>
      ) : (
        <>
          {describeChecklistSessionResult(session.result).kind === 'scored' && (
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
          {describeChecklistSessionResult(session.result).kind === 'notScored' && (
            <div style={{ marginTop: 16, borderRadius: 14, padding: '16px 18px', background: COLORS.warningSoft, color: COLORS.warning }}>
              {t('checklistSessions.learner.notScored', 'Not scored (all skipped)')}
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
