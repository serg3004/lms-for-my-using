import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { listChecklistSessions, markChecklistSessionObserverUnavailable } from '../shared/api/checklistSessions.js';
import type { ChecklistSessionSummary } from '../shared/api/types.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { formatDate } from '../shared/formatDate.js';
import { Badge, Button, Dialog, InlineFeedback, PageState } from '../shared/ui.js';
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
  const { state, reload } = useAsyncData<ChecklistSessionSummary[]>(
    fetchObserverSessions,
    [],
    {
      unauthenticated: t('checklistSessions.conduct.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('checklistSessions.conduct.loadError', 'Unable to load your sessions.'),
    },
  );
  const [unavailableTarget, setUnavailableTarget] = useState<ChecklistSessionSummary | null>(null);

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
              <SessionCard key={session.id} session={session} onOpen={makeOpenHandler(onOpenSession, session.id)} onMarkUnavailable={() => setUnavailableTarget(session)} t={t} />
            ))}
          </ul>
        )}
      </div>
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 8px' }}>{t('checklistSessions.conduct.history', 'History')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {history.map((session) => (
              <SessionCard key={session.id} session={session} onOpen={makeOpenHandler(onOpenSession, session.id)} onMarkUnavailable={() => setUnavailableTarget(session)} t={t} />
            ))}
          </ul>
        </div>
      )}
      <MarkUnavailableDialog
        onClose={() => setUnavailableTarget(null)}
        onMarked={() => void reload()}
        session={unavailableTarget}
        t={t}
      />
    </div>
  );
}

function SessionCard({ session, onOpen, onMarkUnavailable, t }: { session: ChecklistSessionSummary; onOpen: () => void; onMarkUnavailable: () => void; t: TFunction }) {
  return (
    <li style={{
      border: `1px solid ${COLORS.border}`,
      background: COLORS.surface,
      borderRadius: 14,
      padding: 16,
    }}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          width: '100%',
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          padding: 0,
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
        {/* PR 303: rendered in the session's own timezone -- see AdminChecklistSessionsPage's list column for why. */}
        {session.scheduledAt && (
          <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 12.5 }}>
            {formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: session.timezone })}
          </p>
        )}
      </button>
      {/* PR 302: reporting unavailability only makes sense while the observer could still be
          swapped out -- once the session starts, participants are frozen (see ADR). */}
      {session.status === 'scheduled' && (
        session.observerUnavailableReason ? (
          <p style={{ color: 'var(--color-warning-text, #92400e)', margin: '8px 0 0', fontSize: 12.5 }}>
            {t('checklistSessions.conduct.markedUnavailable', "You've reported you can't conduct this session.")}
          </p>
        ) : (
          <button
            onClick={onMarkUnavailable}
            style={{ marginTop: 8, minHeight: 44, background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '6px 12px', cursor: 'pointer' }}
            type="button"
          >
            {t('checklistSessions.conduct.markUnavailable', "Can't conduct this")}
          </button>
        )
      )}
    </li>
  );
}

function MarkUnavailableDialog({ session, onClose, onMarked, t }: { session: ChecklistSessionSummary | null; onClose: () => void; onMarked: () => void; t: TFunction }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  // Review fix (PR 302): the dialog stays mounted between opens (only `session` toggles null/a
  // row), so without this the previous reason/error would survive a Cancel/Escape/backdrop close
  // and reappear -- already filled in and submittable -- if the button is clicked for a
  // *different* session next.
  useEffect(() => {
    setReason('');
    setError(null);
  }, [session?.id]);

  async function submit() {
    if (!session || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await markChecklistSessionObserverUnavailable(session.id, { reason: reason.trim(), version: session.version });
      setReason('');
      onMarked();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklistSessions.conduct.markUnavailableError', 'Unable to report unavailability.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={session !== null}>
      <h2 id={titleId}>{t('checklistSessions.conduct.markUnavailableTitle', "Can't conduct this session")}</h2>
      {error && <InlineFeedback tone="error">{error}</InlineFeedback>}
      <label>
        {t('checklistSessions.conduct.markUnavailableReason', 'Reason')}
        <textarea onChange={(e) => setReason(e.target.value)} rows={3} style={{ width: '100%' }} value={reason} />
      </label>
      <div className="ds-dialog__actions">
        <button className="ds-button ds-button--secondary ds-button--md" disabled={busy} onClick={onClose} type="button">
          {t('checklistSessions.conduct.markUnavailableCancel', 'Cancel')}
        </button>
        <Button aria-busy={busy || undefined} disabled={busy || !reason.trim()} onClick={() => void submit()} variant="primary">
          {t('checklistSessions.conduct.markUnavailableSubmit', 'Report')}
        </Button>
      </div>
    </Dialog>
  );
}
