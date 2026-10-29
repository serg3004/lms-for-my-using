import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { getChecklistInstance } from '../shared/api/checklists.js';
import {
  captureChecklistSessionLocation,
  downloadChecklistSessionReportPdf,
  getChecklistSession,
  getChecklistSessionReport,
  listChecklistScoreRevisions,
  listChecklistSessionEvents,
  listChecklistSessionLocationCaptures,
  recalculateChecklistSessionScore,
} from '../shared/api/checklistSessions.js';
import type {
  ChecklistInstanceSummary,
  ChecklistLocationCapture,
  ChecklistLocationCapturePoint,
  ChecklistLocationCaptureStatus,
  ChecklistScoreRevision,
  ChecklistScoreFormula,
  ChecklistSessionReport,
  ChecklistSessionEvent,
  ChecklistSessionSummary,
  RecalculateChecklistScoreResult,
} from '../shared/api/types.js';
import { formatDate } from '../shared/formatDate.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Badge, Dialog, InlineFeedback, PageState } from '../shared/ui.js';
import { formatParticipantName } from '../features/admin-checklist-sessions/domain.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';
import { ChecklistReviewPhotoEvidence } from './ChecklistReviewPhotoEvidence.js';
import { DeleteResultDialog } from '../features/admin-checklist-sessions/ChecklistResultDeletion.js';
import { ReportCriteria, ReportSummary } from '../features/admin-checklist-sessions/SessionReportView.js';

type Tab = 'summary' | 'participants' | 'criteria' | 'files' | 'history';

export function findResultForItem(results: ChecklistInstanceSummary['results'], itemId: string) {
  return results.find((result) => result.itemId === itemId);
}

/** Reuses the same keys as the geolocation policy `<select>` options (e.g.
 *  ChecklistWorkplaceSettingsDialog) so the report never prints the raw `off`/`optional`/`required`
 *  enum value (PR 316). Written as three literal translate calls rather than one templated key, so
 *  the i18n key-coverage test that statically scans this file's source can see all three. */
function describeGeolocationPolicy(policy: ChecklistSessionSummary['locationCapturePolicy'], t: TFunction) {
  if (policy === 'required') return t('admin.checklists.settings.geolocationRequired', 'Required');
  if (policy === 'optional') return t('admin.checklists.settings.geolocationOptional', 'Optional');
  return t('admin.checklists.settings.geolocationOff', 'Off');
}

export function describeScoreFormula(formula: ChecklistScoreFormula | undefined, t: TFunction) {
  return formula === 'criteria'
    ? t('admin.checklists.report.formulaCriteria', 'By criteria (marked / total)')
    : t('admin.checklists.report.formulaSnapshot', 'Checklist settings (points and weights)');
}

export function RecalculateForm({ sessionId, onDone, t }: { sessionId: string; onDone: (revision: RecalculateChecklistScoreResult) => void; t: TFunction }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [formula, setFormula] = useState<ChecklistScoreFormula>('snapshot');
  const [result, setResult] = useState<RecalculateChecklistScoreResult | null>(null);
  const retry = useRef<{ reason: string; formula: ChecklistScoreFormula; key: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || status === 'saving') return;
    if (!retry.current || retry.current.reason !== trimmed || retry.current.formula !== formula) {
      retry.current = { reason: trimmed, formula, key: crypto.randomUUID() };
    }
    setStatus('saving');
    setError(null);
    try {
      const revision = await recalculateChecklistSessionScore(sessionId, { reason: trimmed, formula, idempotencyKey: retry.current.key });
      setReason('');
      setResult(revision);
      setStatus('idle');
      onDone(revision);
      retry.current = null;
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.report.recalculateError', 'Unable to recalculate the score.'));
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 480 }}>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.formulaLabel', 'Formula')}
        <select className="admin-input" disabled={status === 'saving'} value={formula} onChange={(event) => setFormula(event.target.value as ChecklistScoreFormula)}>
          <option value="snapshot">{describeScoreFormula('snapshot', t)}</option>
          <option value="criteria">{describeScoreFormula('criteria', t)}</option>
        </select>
      </label>
      {formula === 'criteria' && <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>{t('admin.checklists.report.formulaHint', 'Criteria have equal weight. Skipped criteria are excluded; a selected scale level counts as a mark. Rejected answers do not count as marked.')}</p>}
      {result && <InlineFeedback tone="success" title={t('admin.checklists.report.recalculated', 'Score recalculated')}>
        <strong>{result.previousPercentage}% → {result.scored ? `${result.newPercentage}%` : t('admin.checklists.report.notScored', 'Not scored')}</strong>
        <p>{describeScoreFormula(result.formula, t)}</p>
      </InlineFeedback>}
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.recalculateReason', 'Reason for recalculation')}
        <textarea className="admin-input" disabled={status === 'saving'} maxLength={500} onChange={(event) => setReason(event.target.value)} required rows={2} value={reason} />
      </label>
      {error && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
      <button className="admin-btn admin-btn--secondary" disabled={status === 'saving' || reason.trim().length === 0} type="submit">
        {status === 'saving' ? t('admin.checklists.report.recalculating', 'Recalculating...') : t('admin.checklists.report.recalculate', 'Recalculate score')}
      </button>
    </form>
  );
}

/**
 * PR 306: closes the "required location + audited override" anomaly's missing half -- the
 * backend (`ChecklistSessionService.captureLocation`, PR 290/304) has always accepted an admin
 * submitting a capture on the observer's behalf with a required `overrideReason`, and audits it
 * (`checklist_location.accessed`), but no frontend ever called it for anyone other than the
 * observer themselves (`ChecklistSessionConduct.tsx`'s own capture is always self-service). This
 * is the admin-facing entry point: only offered for a capture point that has no row yet (the
 * unique-per-point constraint would otherwise 409), same shape as `RecalculateForm` above.
 */
export function LocationOverrideForm({
  sessionId,
  missingPoints,
  onDone,
  t,
}: {
  sessionId: string;
  missingPoints: ChecklistLocationCapturePoint[];
  onDone: () => void;
  t: TFunction;
}) {
  const [point, setPoint] = useState<ChecklistLocationCapturePoint>(missingPoints[0] ?? 'start');
  const [status, setStatus] = useState<ChecklistLocationCaptureStatus>('captured');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [reason, setReason] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (missingPoints.length === 0) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    if (status === 'captured' && (latitude.trim() === '' || longitude.trim() === '')) return;
    setSaveState('saving');
    setError(null);
    try {
      await captureChecklistSessionLocation(sessionId, point, {
        status,
        overrideReason: trimmedReason,
        ...(status === 'captured' ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
      });
      setReason('');
      setLatitude('');
      setLongitude('');
      setSaveState('idle');
      onDone();
    } catch (err) {
      setSaveState('error');
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.report.locationOverrideError', 'Unable to record the location capture.'));
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 480 }}>
      <h4 style={{ margin: 0 }}>{t('admin.checklists.report.locationOverrideTitle', 'Record on the observer’s behalf')}</h4>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.locationOverridePoint', 'Capture point')}
        <select className="admin-input" onChange={(event) => setPoint(event.target.value as ChecklistLocationCapturePoint)} value={point}>
          {missingPoints.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate === 'start' ? t('admin.checklists.report.locationStart', 'Start') : t('admin.checklists.report.locationEnd', 'End')}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.locationOverrideStatus', 'Status')}
        <select className="admin-input" onChange={(event) => setStatus(event.target.value as ChecklistLocationCaptureStatus)} value={status}>
          <option value="captured">{t('admin.checklists.report.locationOverrideCaptured', 'Coordinates known')}</option>
          <option value="denied">{t('admin.checklists.report.locationOverrideDenied', 'Denied')}</option>
          <option value="unavailable">{t('admin.checklists.report.locationOverrideUnavailable', 'Unavailable')}</option>
        </select>
      </label>
      {status === 'captured' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
            {t('admin.checklists.report.locationLatitude', 'Latitude')}
            <input className="admin-input" onChange={(event) => setLatitude(event.target.value)} required type="number" step="any" min={-90} max={90} value={latitude} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
            {t('admin.checklists.report.locationLongitude', 'Longitude')}
            <input className="admin-input" onChange={(event) => setLongitude(event.target.value)} required type="number" step="any" min={-180} max={180} value={longitude} />
          </label>
        </div>
      )}
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.locationOverrideReason', 'Reason for recording this on their behalf')}
        <textarea className="admin-input" onChange={(event) => setReason(event.target.value)} required rows={2} value={reason} />
      </label>
      {error && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
      <button className="admin-btn admin-btn--secondary" disabled={saveState === 'saving' || reason.trim().length === 0} type="submit">
        {saveState === 'saving' ? t('admin.checklists.report.locationOverrideSaving', 'Saving...') : t('admin.checklists.report.locationOverrideSubmit', 'Record location')}
      </button>
    </form>
  );
}

type HistoryData = { events: ChecklistSessionEvent[]; revisions: ChecklistScoreRevision[] };

/** PR 322: recalculation now happens from the header's dialog (`RecalculateDialog` below), not an
 *  embedded form here -- this tab is read-only history. Revisions still show up here because each
 *  mount re-fetches fresh from the server, and the tab only mounts when selected. */
export function HistoryTab({ sessionId, t }: { sessionId: string; t: TFunction }) {
  const { state } = useAsyncData<HistoryData>(
    async () => {
      const [events, revisions] = await Promise.all([listChecklistSessionEvents(sessionId), listChecklistScoreRevisions(sessionId)]);
      return { events, revisions };
    },
    [sessionId],
    { unauthenticated: t('admin.checklists.report.loadError', 'Unable to load the session report.'), error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );

  if (state.status === 'loading') return <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />;
  if (state.status !== 'loaded') return <PageState message={state.message} variant="error" />;

  return (
    <div className="admin-card">
      <h3 style={{ marginTop: 0 }}>{t('admin.checklists.report.eventsTitle', 'Event history')}</h3>
      {state.data.events.length === 0 ? (
        <p>{t('admin.checklists.report.eventsEmpty', 'No events recorded yet.')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {state.data.events.map((event) => (
            <li key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>{t(`checklistSessions.event.${event.eventType}`, event.eventType)}</span>
              <span style={{ color: '#6b7280' }}>{formatDate(event.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>{t('admin.checklists.report.revisionsTitle', 'Score revisions')}</h3>
      {state.data.revisions.length === 0 ? (
        <p>{t('admin.checklists.report.revisionsEmpty', 'The score has never been recalculated.')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {state.data.revisions.map((revision) => (
            <li key={revision.id} style={{ border: '1px solid #e3e8ef', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{revision.previousPercentage}% → {revision.newScored === false ? t('admin.checklists.report.notScored', 'Not scored') : `${revision.newPercentage}%`}</strong>
                <span style={{ color: '#6b7280' }}>{formatDate(revision.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <p style={{ margin: '4px 0' }}>{describeScoreFormula(revision.formula, t)}</p>
              {revision.reason && <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{revision.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** PR 322: wraps the existing `RecalculateForm` in the shared `Dialog` shell, opened from the
 *  header's "Recalculate" button instead of always sitting embedded at the bottom of the History
 *  tab. */
export function RecalculateDialog({ open, onClose, sessionId, onDone, t }: { open: boolean; onClose: () => void; sessionId: string; onDone: (revision: RecalculateChecklistScoreResult) => void; t: TFunction }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog initialFocusRef={closeRef} labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.report.recalculateDialogTitle', 'Recalculate score')}</h2>
      <RecalculateForm key={open ? 'open' : 'closed'} sessionId={sessionId} onDone={onDone} t={t} />
      <div className="ds-dialog__actions">
        <button className="ds-button ds-button--secondary ds-button--md" onClick={onClose} ref={closeRef} type="button">{t('admin.checklists.report.recalculateDialogClose', 'Close')}</button>
      </div>
    </Dialog>
  );
}

/** PR 360б: `variant="observer"` renders the same report in the instructor's and the mentor's own layout. */
export function AdminChecklistSessionReportPage({ variant = 'admin' }: { variant?: 'admin' | 'observer' }) {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { state, mutate } = useAsyncData<ChecklistSessionSummary>(
    () => getChecklistSession(id!),
    [id],
    {
      unauthenticated: t('admin.checklists.report.loadError', 'Unable to load the session report.'),
      notFound: t('admin.checklists.report.notFound', 'This session no longer exists.'),
      error: t('admin.checklists.report.loadError', 'Unable to load the session report.'),
    },
  );

  if (state.status === 'loading') {
    return <main className="admin-state"><PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" /></main>;
  }
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <main className="admin-state"><PageState title={t('admin.checklists.report.title', 'Session report')} message={state.message} variant="error" /></main>;
  }

  return <SessionReportBody session={state.data} onScoreRecalculated={(revision) => mutate((s) => ({ ...s, result: { ...s.result, percentage: revision.newPercentage, passed: revision.newPassed, scored: revision.scored } }))} t={t} variant={variant} />;
}

export function SessionReportBody({
  session,
  onScoreRecalculated,
  t,
  variant = 'admin',
}: {
  variant?: 'admin' | 'observer';
  session: ChecklistSessionSummary;
  // Merges the recalculation's own response into local state instead of a full page reload --
  // a network reload flips the parent's AsyncDataState back to 'loading', which early-returns
  // above and unmounts this whole component (losing the currently-selected tab) for the split
  // second the refetch is in flight. Same fix as ChecklistSessionConduct.tsx's onMutate.
  onScoreRecalculated: (revision: RecalculateChecklistScoreResult) => void;
  t: TFunction;
}) {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.roles.includes('admin') ?? false;
  // PR 362: recalculation belongs to the four organization roles; the server enforces it too.
  const canRecalculate = currentUser?.roles.some((role) => role !== 'learner') ?? false;
  const [tab, setTab] = useState<Tab>('summary');
  const [recalcOpen, setRecalcOpen] = useState(false);
  // PR 367: only an administrator deletes a finished result; the server enforces it too.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resultDeleted, setResultDeleted] = useState(false);
  const canDeleteResult = isAdmin && session.status === 'completed';
  // PR 372: the PDF is built on the server (same rights and audit as the report); failures (too large, too slow) show the server's message.
  const [pdfState, setPdfState] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({ status: 'idle' });
  const downloadPdf = async () => {
    setPdfState({ status: 'loading' });
    try {
      const { blob, filename } = await downloadChecklistSessionReportPdf(session.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `checklist-session-${session.id}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPdfState({ status: 'idle' });
    } catch (err) {
      setPdfState({ status: 'error', message: err instanceof ApiClientError ? err.message : t('admin.checklists.report.pdfError', 'Unable to download the PDF.') });
    }
  };

  const { state: instanceState } = useAsyncData<ChecklistInstanceSummary>(
    () => getChecklistInstance(session.instanceId),
    [session.instanceId],
    { unauthenticated: '', error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );
  const { state: locationState, reload: reloadLocations } = useAsyncData<ChecklistLocationCapture[]>(
    () => listChecklistSessionLocationCaptures(session.id),
    [session.id],
    { unauthenticated: '', error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );
  // PR 371: summary and criteria render the server report (PR 370); a recalculation refetches it.
  const { state: reportState, reload: reloadReport } = useAsyncData<ChecklistSessionReport>(
    () => getChecklistSessionReport(session.id),
    [session.id],
    { unauthenticated: '', error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );
  // PR 322: the summary tab's own compact "result history" timeline -- fetched here (not inside
  // the Summary-tab render) so `reload` is reachable from the header's recalculate dialog even
  // when the user recalculates from a different tab.
  const { state: revisionsState, reload: reloadRevisions } = useAsyncData<ChecklistScoreRevision[]>(
    () => listChecklistScoreRevisions(session.id),
    [session.id],
    { unauthenticated: '', error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );

  const navItems: AdminNavItem[] = [
    { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' },
    { label: session.checklist.title, href: `/admin/checklists/sessions/${session.id}`, isCurrent: true },
  ];
  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: t('admin.checklists.report.tabSummary', 'Summary') },
    { key: 'participants', label: t('admin.checklists.report.tabParticipants', 'Participants') },
    { key: 'criteria', label: t('admin.checklists.report.tabCriteria', 'Criteria') },
    { key: 'files', label: t('admin.checklists.report.tabFiles', 'Files') },
    { key: 'history', label: t('admin.checklists.report.tabHistory', 'History') },
  ];

  const wrap = (children: ReactNode) => (variant === 'observer'
    ? <ObserverPageLayout>{children}</ObserverPageLayout>
    : <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>{children}</AdminPageLayout>);

  return wrap(
    <>
      {variant === 'observer' && <ObserverSessionsNav current="all" />}
      <AdminPageHeader
        eyebrow={t('admin.checklists.report.eyebrow', 'Session report')}
        title={session.checklist.title}
        subtitle={
          session.scheduledAt
            ? t('admin.checklists.report.subtitleDateEmployee', '{{date}} · {{employee}}', {
                // PR 303: rendered in the session's own timezone -- see AdminChecklistSessionsPage's list column for why.
                date: formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeZone: session.timezone }),
                employee: formatParticipantName(session.learner),
              })
            : formatParticipantName(session.learner)
        }
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>{t(`checklistSessions.status.${session.status}`, session.status)}</Badge>
            <button className="admin-btn admin-btn--secondary" onClick={() => window.print()} type="button">{t('admin.checklists.report.print', 'Print')}</button>
            <button className="admin-btn admin-btn--secondary" disabled={pdfState.status === 'loading'} onClick={() => void downloadPdf()} type="button">
              {pdfState.status === 'loading' ? t('admin.checklists.report.pdfLoading', 'Preparing PDF…') : t('admin.checklists.report.pdf', 'Download PDF')}
            </button>
            {canRecalculate && (
              <button className="admin-btn admin-btn--secondary" onClick={() => setRecalcOpen(true)} type="button">{t('admin.checklists.report.recalculateOpen', 'Recalculate')}</button>
            )}
            {canDeleteResult && !resultDeleted && (
              <button className="admin-btn admin-btn--secondary" onClick={() => setDeleteOpen(true)} type="button">{t('admin.checklists.resultDelete.open', 'Delete result')}</button>
            )}
          </div>
        }
      />

      {pdfState.status === 'error' && (
        <InlineFeedback tone="error" title={t('admin.checklists.report.pdfError', 'Unable to download the PDF.')}>{pdfState.message}</InlineFeedback>
      )}

      {canRecalculate && (
        <RecalculateDialog
          onClose={() => setRecalcOpen(false)}
          onDone={(revision) => { onScoreRecalculated(revision); void reloadRevisions(); void reloadReport(); }}
          open={recalcOpen}
          sessionId={session.id}
          t={t}
        />
      )}

      {canDeleteResult && (
        <DeleteResultDialog
          instanceId={session.instanceId}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setDeleteOpen(false); setResultDeleted(true); }}
          open={deleteOpen}
          t={t}
        />
      )}
      {resultDeleted && (
        <InlineFeedback tone="success" title={t('admin.checklists.resultDelete.done', 'The result was deleted. You can restore it from the sessions page within 30 days.')}>
          <a href="/admin/checklists/sessions">{t('admin.checklists.resultDelete.backToSessions', 'Back to sessions')}</a>
        </InlineFeedback>
      )}

      <div aria-label={t('admin.checklists.report.tabsLabel', 'Session report sections')} className="admin-org-tabs" role="tablist">
        {tabs.map(({ key, label }) => (
          <button
            aria-selected={tab === key}
            className="admin-org-tabs__tab"
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          {reportState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
          {(reportState.status === 'unauthenticated' || reportState.status === 'notFound' || reportState.status === 'error') && (
            <PageState message={reportState.message || t('admin.checklists.report.loadError', 'Unable to load the session report.')} variant="error" />
          )}
          {reportState.status === 'loaded' && <ReportSummary report={reportState.data} t={t} />}

          <div className="admin-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t('admin.checklists.report.resultHistoryTitle', 'Result history')}</h3>
            {revisionsState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
            {revisionsState.status === 'loaded' && (
              revisionsState.data.length === 0 ? (
                <p>{t('admin.checklists.report.resultHistoryEmpty', 'The score has never been recalculated.')}</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {revisionsState.data.map((revision) => (
                    <li key={revision.id} style={{ display: 'flex', gap: 10 }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: '#6b7280', fontSize: 12.5 }}>{formatDate(revision.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        <div><strong>{revision.previousPercentage}% → {revision.newScored === false ? t('admin.checklists.report.notScored', 'Not scored') : `${revision.newPercentage}%`}</strong>{revision.reason ? ` — ${revision.reason}` : ''}</div>
                        <div>{describeScoreFormula(revision.formula, t)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <div className="admin-card" style={{ marginTop: 16 }}>
            <p style={{ margin: 0 }}><strong>{t('admin.checklists.report.location', 'Location capture')}:</strong> {describeGeolocationPolicy(session.locationCapturePolicy, t)}</p>
          </div>
        </>
      )}

      {tab === 'participants' && (
        <div className="admin-card">
          <p><strong>{t('admin.checklists.sessions.columns.learner', 'Employee')}:</strong> {formatParticipantName(session.learner)} ({session.learner.email})</p>
          <p><strong>{t('admin.checklists.sessions.columns.observer', 'Observer')}:</strong> {formatParticipantName(session.observer)} ({session.observer.email})</p>
        </div>
      )}

      {tab === 'criteria' && (
        <div className="admin-card">
          {reportState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
          {(reportState.status === 'unauthenticated' || reportState.status === 'notFound' || reportState.status === 'error') && (
            <PageState message={reportState.message || t('admin.checklists.report.loadError', 'Unable to load the session report.')} variant="error" />
          )}
          {reportState.status === 'loaded' && <ReportCriteria report={reportState.data} t={t} />}
        </div>
      )}

      {tab === 'files' && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>{t('admin.checklists.report.photosTitle', 'Photo evidence')}</h3>
          {instanceState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
          {instanceState.status === 'loaded' && instanceState.data.checklist && (
            (() => {
              const itemsWithPhotos = instanceState.data.checklist.items.filter((item) => hasChecklistPhotoEvidence(findResultForItem(instanceState.data.results, item.id)));
              return itemsWithPhotos.length === 0 ? (
                <p>{t('admin.checklists.report.photosEmpty', 'No photos were attached to this session.')}</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                  {itemsWithPhotos.map((item) => {
                    const result = findResultForItem(instanceState.data.results, item.id)!;
                    return (
                      <li key={item.id}>
                        <p style={{ fontWeight: 600, margin: 0 }}>{item.text}</p>
                        <ChecklistReviewPhotoEvidence instanceId={instanceState.data.id} itemId={item.id} result={result} t={t} />
                      </li>
                    );
                  })}
                </ul>
              );
            })()
          )}

          <h3>{t('admin.checklists.report.locationTitle', 'Location captures')}</h3>
          {locationState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
          {locationState.status === 'loaded' && (
            locationState.data.length === 0 ? (
              <p>{t('admin.checklists.report.locationEmpty', 'No location captures recorded.')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {locationState.data.map((capture) => (
                  <li key={capture.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{capture.capturePoint} — {capture.status}</span>
                    <span style={{ color: '#6b7280' }}>{formatDate(capture.capturedAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </li>
                ))}
              </ul>
            )
          )}
          {isAdmin && locationState.status === 'loaded' && session.locationCapturePolicy !== 'off' && (
            <LocationOverrideForm
              missingPoints={(['start', 'end'] as ChecklistLocationCapturePoint[]).filter(
                (candidate) => !locationState.data.some((capture) => capture.capturePoint === candidate),
              )}
              onDone={() => void reloadLocations()}
              sessionId={session.id}
              t={t}
            />
          )}
        </div>
      )}

      {tab === 'history' && <HistoryTab sessionId={session.id} t={t} />}
    </>,
  );
}
