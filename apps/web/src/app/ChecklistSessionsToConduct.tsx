import type { TFunction } from 'i18next';
import { listChecklistSessions } from '../shared/api/checklistSessions.js';
import type { ChecklistSessionSummary } from '../shared/api/types.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Badge, PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

const COLORS = {
  surface: 'var(--color-surface)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
};

// A session is still "to conduct" once it exists and hasn't reached a terminal state -- scheduled
// (not started yet), in_progress, or paused. Completed/cancelled sessions are history, not queue.
function isActionable(session: ChecklistSessionSummary) {
  return session.status === 'scheduled' || session.status === 'in_progress' || session.status === 'paused';
}

export async function fetchObserverSessions(): Promise<ChecklistSessionSummary[]> {
  const result = await listChecklistSessions({ pageSize: 100 });
  return result.items;
}

export function makeOpenHandler(onOpenSession: (sessionId: string) => void, sessionId: string) {
  return () => onOpenSession(sessionId);
}

/**
 * PR 297: the observer's own sessions, reusing `GET /checklist-sessions` -- `sessionScope()`
 * already restricts a pure instructor to `{ observerId: user.id }`, so no extra query filter is
 * needed here to get "my sessions" (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md).
 * Isolated into its own component (own hooks, own data load) so it never shifts the hook-call
 * order of the review-queue tabs it sits alongside in InstructorChecklistReviewsPage.
 */
export function ChecklistSessionsToConduct({ onOpenSession, t }: { onOpenSession: (sessionId: string) => void; t: TFunction }) {
  const { state } = useAsyncData<ChecklistSessionSummary[]>(
    fetchObserverSessions,
    [],
    {
      unauthenticated: t('checklistSessions.conduct.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('checklistSessions.conduct.loadError', 'Unable to load your sessions.'),
    },
  );

  if (state.status === 'loading') {
    return <PageState message={t('checklistSessions.conduct.loading', 'Loading your sessions...')} variant="loading" />;
  }
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <PageState title={t('checklistSessions.conduct.title', 'Sessions')} message={state.message} variant="error" />;
  }

  const toConduct = state.data.filter(isActionable);
  const history = state.data.filter((session) => !isActionable(session));

  if (state.data.length === 0) {
    return <PageState message={t('checklistSessions.conduct.empty', 'No checklist sessions are assigned to you yet.')} />;
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 8px' }}>
          {t('checklistSessions.conduct.toConduct', 'To conduct')}
        </h2>
        {toConduct.length === 0 ? (
          <p style={{ color: COLORS.muted, fontSize: 13 }}>{t('checklistSessions.conduct.toConductEmpty', 'Nothing scheduled right now.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {toConduct.map((session) => (
              <SessionCard key={session.id} session={session} onOpen={makeOpenHandler(onOpenSession, session.id)} t={t} />
            ))}
          </ul>
        )}
      </div>
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 8px' }}>{t('checklistSessions.conduct.history', 'History')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {history.map((session) => (
              <SessionCard key={session.id} session={session} onOpen={makeOpenHandler(onOpenSession, session.id)} t={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, onOpen, t }: { session: ChecklistSessionSummary; onOpen: () => void; t: TFunction }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        style={{
          width: '100%',
          textAlign: 'left',
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          borderRadius: 14,
          padding: 16,
          cursor: 'pointer',
          // >=44px touch target per PR 297's mobile UX criterion.
          minHeight: 44,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong>{session.checklist.title}</strong>
          <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
            {t(`checklistSessions.status.${session.status}`, session.status)}
          </Badge>
        </div>
        <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 13 }}>
          {session.learner.firstName} {session.learner.lastName}
        </p>
        {session.scheduledAt && (
          <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 12.5 }}>
            {new Date(session.scheduledAt).toLocaleString()}
          </p>
        )}
      </button>
    </li>
  );
}
