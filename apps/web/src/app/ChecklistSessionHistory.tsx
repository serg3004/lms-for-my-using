import type { TFunction } from 'i18next';
import { listChecklistSessions } from '../shared/api/checklistSessions.js';
import type { ChecklistSessionSummary } from '../shared/api/types.js';
import { describeChecklistSessionResult } from '../shared/checklistStatus.js';
import { formatDate } from '../shared/formatDate.js';
import { Badge, Button } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

/** How many previous sessions the observer sees before starting (PR 332). */
export const PAST_SESSIONS_LIMIT = 3;

/**
 * PR 332: previous completed sessions of the same employee on the same sheet, shown before the
 * observer starts. It rides on the regular `GET /checklist-sessions`, so the server's
 * `sessionScope()` decides what is visible (an instructor only ever gets sessions they observed)
 * and the result/feedback masking stays server-side. `preSessionVisibility` is the *employee's*
 * pre-session view and does not limit the observer.
 */
export function fetchPastSessions(session: Pick<ChecklistSessionSummary, 'id' | 'checklist' | 'learner'>) {
  return listChecklistSessions({
    status: 'completed',
    learnerId: session.learner.id,
    checklistId: session.checklist.id,
    sort: 'recent',
    excludeSessionId: session.id,
    pageSize: PAST_SESSIONS_LIMIT,
  });
}

export function PastSessions({ session, t }: { session: ChecklistSessionSummary; t: TFunction }) {
  const { state, reload } = useAsyncData(() => fetchPastSessions(session), [session.id, session.learner.id, session.checklist.id], {
    unauthenticated: t('checklistSessions.conduct.sessionExpired', 'Your session expired. Sign in again.'),
    notFound: t('checklistSessions.conduct.history.error', 'Unable to load past sessions.'),
    error: t('checklistSessions.conduct.history.error', 'Unable to load past sessions.'),
  });

  return (
    <section aria-labelledby="past-sessions-title" style={{ marginTop: 20 }}>
      <h2 id="past-sessions-title" style={{ margin: '0 0 8px', fontSize: 15 }}>
        {t('checklistSessions.conduct.history.title', 'Past sessions')}
      </h2>
      {state.status === 'loading' && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('checklistSessions.conduct.history.loading', 'Loading past sessions...')}
        </p>
      )}
      {(state.status === 'error' || state.status === 'notFound' || state.status === 'unauthenticated') && (
        <div>
          <p role="alert" style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-danger)' }}>
            {state.message}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void reload()}>
            {t('checklistSessions.conduct.reload', 'Reload')}
          </Button>
        </div>
      )}
      {state.status === 'loaded' && state.data.items.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('checklistSessions.conduct.history.empty', 'No completed sessions with this employee on this sheet yet.')}
        </p>
      )}
      {state.status === 'loaded' && state.data.items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {state.data.items.map((past) => (
            <PastSessionCard key={past.id} past={past} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PastSessionCard({ past, t }: { past: ChecklistSessionSummary; t: TFunction }) {
  const date = past.startedAt ?? past.scheduledAt;
  const result = describeChecklistSessionResult(past.result);
  return (
    <li style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{date ? formatDate(date, undefined, { dateStyle: 'medium', timeZone: past.timezone }) : '—'}</span>
        {result.kind === 'scored' && (
          <Badge variant={result.passed ? 'success' : 'danger'}>
            {result.percentage}% {result.passed ? '✓' : '✗'}
          </Badge>
        )}
        {result.kind === 'notScored' && <Badge variant="neutral">{t('checklistSessions.conduct.history.notScored', 'Not scored')}</Badge>}
      </div>
      {past.strengths || past.developmentAreas ? (
        <dl style={{ margin: '8px 0 0', display: 'grid', gap: 6, fontSize: 13 }}>
          {past.strengths && (
            <div>
              <dt style={{ fontWeight: 600 }}>{t('checklistSessions.conduct.strengths', 'Strengths')}</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{past.strengths}</dd>
            </div>
          )}
          {past.developmentAreas && (
            <div>
              <dt style={{ fontWeight: 600 }}>{t('checklistSessions.conduct.developmentAreas', 'Development areas')}</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{past.developmentAreas}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('checklistSessions.conduct.history.noFeedback', 'No feedback was recorded.')}
        </p>
      )}
    </li>
  );
}
