import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { getChecklistInstance } from '../shared/api/checklists.js';
import {
  getChecklistSession,
  listChecklistScoreRevisions,
  listChecklistSessionEvents,
  listChecklistSessionLocationCaptures,
  recalculateChecklistSessionScore,
} from '../shared/api/checklistSessions.js';
import type {
  ChecklistInstanceSummary,
  ChecklistLocationCapture,
  ChecklistScoreRevision,
  ChecklistSessionEvent,
  ChecklistSessionSummary,
} from '../shared/api/types.js';
import { formatDate } from '../shared/formatDate.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Badge, PageState } from '../shared/ui.js';
import { formatParticipantName } from '../features/admin-checklist-sessions/domain.js';
import { checklistResultToAnswer, isChecklistAnswerComplete } from './checklistCompletion.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';
import { ChecklistReviewPhotoEvidence } from './ChecklistReviewPhotoEvidence.js';

type Tab = 'summary' | 'participants' | 'criteria' | 'files' | 'history';

export function findResultForItem(results: ChecklistInstanceSummary['results'], itemId: string) {
  return results.find((result) => result.itemId === itemId);
}

export function RecalculateForm({ sessionId, onDone, t }: { sessionId: string; onDone: () => void; t: TFunction }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    setStatus('saving');
    setError(null);
    try {
      await recalculateChecklistSessionScore(sessionId, { reason: trimmed });
      setReason('');
      setStatus('idle');
      onDone();
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.report.recalculateError', 'Unable to recalculate the score.'));
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 480 }}>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.report.recalculateReason', 'Reason for recalculation')}
        <textarea className="admin-input" onChange={(event) => setReason(event.target.value)} required rows={2} value={reason} />
      </label>
      {error && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
      <button className="admin-btn admin-btn--secondary" disabled={status === 'saving' || reason.trim().length === 0} type="submit">
        {status === 'saving' ? t('admin.checklists.report.recalculating', 'Recalculating...') : t('admin.checklists.report.recalculate', 'Recalculate score')}
      </button>
    </form>
  );
}

type HistoryData = { events: ChecklistSessionEvent[]; revisions: ChecklistScoreRevision[] };

export function HistoryTab({ sessionId, isAdmin, onRecalculated, t }: { sessionId: string; isAdmin: boolean; onRecalculated: () => void; t: TFunction }) {
  const { state, reload } = useAsyncData<HistoryData>(
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
                <strong>{revision.previousPercentage}% → {revision.newPercentage}%</strong>
                <span style={{ color: '#6b7280' }}>{formatDate(revision.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              {revision.reason && <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{revision.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && <RecalculateForm sessionId={sessionId} onDone={() => { void reload(); onRecalculated(); }} t={t} />}
    </div>
  );
}

export function AdminChecklistSessionReportPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { state, reload } = useAsyncData<ChecklistSessionSummary>(
    () => getChecklistSession(id!),
    [id],
    { unauthenticated: t('admin.checklists.report.loadError', 'Unable to load the session report.'), error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );

  if (state.status === 'loading') {
    return <main className="admin-state"><PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" /></main>;
  }
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <main className="admin-state"><PageState title={t('admin.checklists.report.title', 'Session report')} message={state.message} variant="error" /></main>;
  }

  return <SessionReportBody session={state.data} reloadSession={reload} t={t} />;
}

export function SessionReportBody({ session, reloadSession, t }: { session: ChecklistSessionSummary; reloadSession: () => void; t: TFunction }) {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.roles.includes('admin') ?? false;
  const [tab, setTab] = useState<Tab>('summary');

  const { state: instanceState } = useAsyncData<ChecklistInstanceSummary>(
    () => getChecklistInstance(session.instanceId),
    [session.instanceId],
    { unauthenticated: '', error: t('admin.checklists.report.loadError', 'Unable to load the session report.') },
  );
  const { state: locationState } = useAsyncData<ChecklistLocationCapture[]>(
    () => listChecklistSessionLocationCaptures(session.id),
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

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader
        eyebrow={t('admin.checklists.report.eyebrow', 'Session report')}
        title={session.checklist.title}
        subtitle={t('admin.checklists.report.subtitle', 'Full record for one workplace-training session.')}
        action={<button className="admin-btn admin-btn--secondary" onClick={() => window.print()} type="button">{t('admin.checklists.report.print', 'Print')}</button>}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>{t(`checklistSessions.status.${session.status}`, session.status)}</Badge>
        {/* PR 303: rendered in the session's own timezone -- see AdminChecklistSessionsPage's list column for why. */}
        {session.scheduledAt && <span style={{ color: '#6b7280' }}>{formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: session.timezone })}</span>}
      </div>

      <div role="tablist" aria-label={t('admin.checklists.report.tabsLabel', 'Session report sections')} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className="admin-btn admin-btn--sm"
            onClick={() => setTab(key)}
            style={tab === key ? { fontWeight: 700 } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="admin-card">
          <p><strong>{t('admin.checklists.report.checklist', 'Checklist')}:</strong> {session.checklist.title}</p>
          <p><strong>{t('admin.checklists.report.result', 'Result')}:</strong> {session.result.scored ? `${session.result.percentage}% ${session.result.passed ? '✓' : '✗'}` : '—'}</p>
          <p><strong>{t('admin.checklists.report.location', 'Location capture')}:</strong> {session.locationCapturePolicy}</p>
          {(session.strengths || session.developmentAreas || session.nextSteps) && (
            <>
              {session.strengths && <p><strong>{t('checklistSessions.conduct.strengths', 'Strengths')}:</strong> {session.strengths}</p>}
              {session.developmentAreas && <p><strong>{t('checklistSessions.conduct.developmentAreas', 'Development areas')}:</strong> {session.developmentAreas}</p>}
              {session.nextSteps && <p><strong>{t('checklistSessions.conduct.nextSteps', 'Next steps')}:</strong> {session.nextSteps}</p>}
            </>
          )}
        </div>
      )}

      {tab === 'participants' && (
        <div className="admin-card">
          <p><strong>{t('admin.checklists.sessions.columns.learner', 'Employee')}:</strong> {formatParticipantName(session.learner)} ({session.learner.email})</p>
          <p><strong>{t('admin.checklists.sessions.columns.observer', 'Observer')}:</strong> {formatParticipantName(session.observer)} ({session.observer.email})</p>
        </div>
      )}

      {tab === 'criteria' && (
        <div className="admin-card">
          {instanceState.status === 'loading' && <PageState message={t('admin.checklists.report.loading', 'Loading...')} variant="loading" />}
          {(instanceState.status === 'unauthenticated' || instanceState.status === 'notFound' || instanceState.status === 'error') && (
            <PageState message={instanceState.message} variant="error" />
          )}
          {instanceState.status === 'loaded' && instanceState.data.checklist && (
            instanceState.data.checklist.items.length === 0 ? (
              <p>{t('admin.checklists.report.criteriaEmpty', 'This checklist has no criteria.')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {instanceState.data.checklist.items.map((item) => {
                  const result = findResultForItem(instanceState.data.results, item.id);
                  const done = isChecklistAnswerComplete(item, instanceState.data.checklist!.scoringMode, checklistResultToAnswer(result));
                  return (
                    <li key={item.id} style={{ border: `1px solid ${done ? '#0f9f6e' : '#e3e8ef'}`, borderRadius: 12, padding: 12 }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>{item.text}</p>
                      {result?.comment && <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{result.comment}</p>}
                    </li>
                  );
                })}
              </ul>
            )
          )}
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
        </div>
      )}

      {tab === 'history' && <HistoryTab sessionId={session.id} isAdmin={isAdmin} onRecalculated={reloadSession} t={t} />}
    </AdminPageLayout>
  );
}
