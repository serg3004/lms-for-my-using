import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import {
  assignChecklistReviewer,
  getChecklistAnalytics,
  listChecklistInstanceEvents,
  reviewChecklistItemResult,
  searchChecklistReviewQueue,
} from '../shared/api/checklists.js';
import type {
  ChecklistAnalytics,
  ChecklistInstanceEvent,
  ChecklistItemResultSummary,
  ChecklistItemSummary,
} from '../shared/api/types.js';
import type { ChecklistInstanceSummary } from '../shared/api/types.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { Button, PageState, Pagination, StatCard, StatsGrid, Toolbar } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { ChecklistDeadlineMeta } from './ChecklistDeadlineMeta.js';
import { ChecklistReviewPhotoEvidence } from './ChecklistReviewPhotoEvidence.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';
type ChecklistReviewsLayout = ComponentType<{ children: ReactNode; firstName?: string; lastName?: string }>;
type QueueTab = 'mine' | 'unassigned' | 'all';

export function isReviewFlagged(item: ChecklistItemSummary, result: ChecklistItemResultSummary) {
  return item.photoRequired && !hasChecklistPhotoEvidence(result);
}
const COLORS = {
  surface: 'var(--color-surface)',
  soft: 'var(--color-surface-muted)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-bg)',
  warning: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-bg)',
};

type InstructorChecklistReviewsData = {
  instances: ChecklistInstanceSummary[];
  total: number;
  pageSize: number;
  analytics: ChecklistAnalytics;
  currentUserId: string;
  isAdmin: boolean;
  firstName?: string;
  lastName?: string;
};

export function InstructorChecklistReviewsPage({ Layout = InstructorPageLayout }: { Layout?: ChecklistReviewsLayout } = {}) {
  const { t } = useTranslation();
  const [openInstance, setOpenInstance] = useState<ChecklistInstanceSummary | null>(null);
  const [tab, setTab] = useState<QueueTab>('mine');
  const [page, setPage] = useState(1);
  const { state: loadState, reload: load } = useAsyncData<InstructorChecklistReviewsData>(
    async () => {
      const [queue, analytics, currentUser] = await Promise.all([
        searchChecklistReviewQueue({ assignment: tab, page, pageSize: 20 }),
        getChecklistAnalytics(),
        getCurrentUser(),
      ]);
      return {
        instances: queue.items,
        total: queue.total,
        pageSize: queue.pageSize,
        analytics,
        currentUserId: currentUser?.id ?? '',
        isAdmin: Boolean(currentUser?.roles.includes('admin')),
        firstName: currentUser?.firstName,
        lastName: currentUser?.lastName,
      };
    },
    [t, tab, page],
    {
      unauthenticated: t('checklistReview.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('checklistReview.loadError', 'Unable to load pending reviews.'),
    },
  );
  if (loadState.status === 'loading') {
    return (
      <Layout>
        <PageState message={t('checklistReview.loading', 'Loading pending reviews...')} variant="loading" />
      </Layout>
    );
  }
  if (loadState.status === 'unauthenticated') {
    return (
      <Layout>
        <PageState
          title={t('checklistReview.title', 'Checklist review')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </Layout>
    );
  }
  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return (
      <Layout>
        <PageState title={t('checklistReview.title', 'Checklist review')} message={loadState.message} variant="error" />
      </Layout>
    );
  }
  const { instances, total, pageSize, analytics, currentUserId, isAdmin } = loadState.data;

  const tabs: { key: QueueTab; label: string }[] = [
    { key: 'mine', label: t('checklistReview.tabs.mine', 'Assigned to me') },
    { key: 'unassigned', label: t('checklistReview.tabs.unassigned', 'Unassigned') },
    { key: 'all', label: t('checklistReview.tabs.all', 'All') },
  ];

  return (
    <Layout firstName={loadState.data.firstName} lastName={loadState.data.lastName}>
      <div style={{ padding: '24px 0', maxWidth: 860 }}>
        <h1 style={{ color: COLORS.text }}>{t('checklistReview.title', 'Checklist review')}</h1>
        <p style={{ color: COLORS.muted }}>{t('checklistReview.subtitle', 'Checklists submitted by learners that are waiting for your confirmation.')}</p>

        <StatsGrid>
          <StatCard label={t('checklistReview.analytics.assigned', 'Assigned')} value={analytics.assignmentsTotal} />
          <StatCard label={t('checklistReview.analytics.completed', 'Completed')} value={analytics.counts.completed} />
          <StatCard label={t('checklistReview.analytics.passRate', 'Pass rate')} value={`${Math.round(analytics.passRate * 100)}%`} />
          <StatCard label={t('checklistReview.analytics.expired', 'Expired')} value={analytics.counts.expired} />
          <StatCard label={t('checklistReview.analytics.awaitingReview', 'Awaiting review')} value={analytics.pendingReview} />
        </StatsGrid>

        {!openInstance && (
          <Toolbar
            left={
              <div role="tablist" aria-label={t('checklistReview.tabs.label', 'Review queue')} style={{ display: 'flex', gap: 8 }}>
                {tabs.map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    variant={tab === key ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => { setTab(key); setPage(1); }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
          />
        )}

        {openInstance ? (
          <ReviewDetail
            instance={openInstance}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onBack={() => { setOpenInstance(null); void load(); }}
            onInstanceUpdated={setOpenInstance}
            onListRefresh={load}
            t={t}
          />
        ) : instances.length === 0 ? (
          <PageState message={t('checklistReview.empty', 'Nothing is waiting for review.')} />
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {instances.map((instance) => (
                <li
                  key={instance.id}
                  style={{ border: `1px solid ${COLORS.warning}`, background: COLORS.warningSoft, borderRadius: 14, padding: 16, cursor: 'pointer' }}
                  onClick={() => setOpenInstance(instance)}
                >
                  <strong>{instance.checklist?.title}</strong>
                  <p style={{ color: COLORS.muted, marginBottom: 0 }}>{t('checklistReview.submittedBy', 'Submitted by user {{userId}}', { userId: instance.userId })}</p>
                  <p style={{ color: COLORS.muted, marginBottom: 0, fontSize: 12.5 }}>
                    {instance.reviewerId === null
                      ? t('checklistReview.reviewerUnassigned', 'Unassigned')
                      : instance.reviewerId === currentUserId
                        ? t('checklistReview.reviewerMe', 'Assigned to me')
                        : t('checklistReview.reviewerOther', 'Assigned to another reviewer')}
                  </p>
                  <ChecklistDeadlineMeta instance={instance} />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} label={t('checklistReview.paginationLabel', 'Review queue pages')} />
          </>
        )}
      </div>
    </Layout>
  );
}
function ReviewDetail({
  instance,
  currentUserId,
  isAdmin,
  onBack,
  onInstanceUpdated,
  onListRefresh,
  t,
}: {
  instance: ChecklistInstanceSummary;
  currentUserId: string;
  isAdmin: boolean;
  onBack: () => void;
  onInstanceUpdated: (instance: ChecklistInstanceSummary) => void;
  onListRefresh: () => Promise<void>;
  t: TFunction;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [reviewerPending, setReviewerPending] = useState(false);
  const [events, setEvents] = useState<ChecklistInstanceEvent[] | null>(null);
  const checklist = instance.checklist;

  function refreshEvents() {
    listChecklistInstanceEvents(instance.id)
      .then((result) => setEvents(result))
      .catch(() => setEvents([]));
  }

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    listChecklistInstanceEvents(instance.id)
      .then((result) => { if (!cancelled) setEvents(result); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [instance.id]);

  if (!checklist) return null;
  async function decide(itemId: string, status: 'approved' | 'rejected') {
    setPending(itemId);
    setError(null);
    try {
      // reviewChecklistItemResult returns the full instance (checklist + results included).
      const updated = await reviewChecklistItemResult(instance.id, itemId, { status, comment: comment[itemId] });
      onInstanceUpdated(updated);
      refreshEvents();
      void onListRefresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklistReview.saveError', 'Unable to save this decision.'));
    } finally {
      setPending(null);
    }
  }
  async function setReviewer(reviewerId: string | null) {
    setReviewerPending(true);
    setError(null);
    try {
      // assignChecklistReviewer returns a narrower shape without checklist/results —
      // merge only the reviewer fields into the instance already held locally.
      const updated = await assignChecklistReviewer(instance.id, reviewerId);
      onInstanceUpdated({
        ...instance,
        reviewerId: updated.reviewerId,
        reviewAssignedAt: updated.reviewAssignedAt,
        reviewAssignedBy: updated.reviewAssignedBy,
      });
      refreshEvents();
      void onListRefresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklistReview.reviewerAssignError', 'Unable to update the reviewer.'));
    } finally {
      setReviewerPending(false);
    }
  }
  const canManageReviewer = isAdmin || instance.reviewerId === null || instance.reviewerId === currentUserId;
  return (
    <div>
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← {t('checklistReview.backToList', 'All pending reviews')}
      </button>

      <h2 style={{ color: COLORS.text, marginBottom: 4 }}>{checklist.title}</h2>
      <p style={{ color: COLORS.muted }}>{t('checklistReview.submittedBy', 'Submitted by user {{userId}}', { userId: instance.userId })}</p>
      <ChecklistDeadlineMeta instance={instance} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
        <span style={{ color: COLORS.muted, fontSize: 12.5 }}>
          {instance.reviewerId === null
            ? t('checklistReview.reviewerUnassigned', 'Unassigned')
            : instance.reviewerId === currentUserId
              ? t('checklistReview.reviewerMe', 'Assigned to me')
              : t('checklistReview.reviewerOther', 'Assigned to another reviewer')}
        </span>
        {canManageReviewer && instance.reviewerId !== currentUserId && (
          <Button type="button" size="sm" variant="secondary" disabled={reviewerPending} onClick={() => void setReviewer(currentUserId)}>
            {t('checklistReview.assignToMe', 'Assign to me')}
          </Button>
        )}
        {canManageReviewer && instance.reviewerId !== null && (
          <Button type="button" size="sm" variant="ghost" disabled={reviewerPending} onClick={() => void setReviewer(null)}>
            {t('checklistReview.unassign', 'Unassign')}
          </Button>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }} role="alert">{error}</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.items.map((item) => {
          const result = instance.results.find((r) => r.itemId === item.id);
          if (!result) return null;
          const hasEvidence = hasChecklistPhotoEvidence(result);
          const flagged = isReviewFlagged(item, result);
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${flagged ? COLORS.warning : COLORS.border}`,
                background: flagged ? COLORS.warningSoft : COLORS.soft,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{item.text}</p>
                  <p style={{ color: flagged ? COLORS.warning : COLORS.muted, fontSize: 12.5, margin: 0 }}>
                    {item.isRequired ? t('checklistReview.required', 'Required') : t('checklistReview.optional', 'Optional')}
                    {' · '}
                    {item.photoRequired ? t('checklistReview.photoRequired', 'photo required') : t('checklistReview.photoOptional', 'photo optional')}
                    {' · '}
                    {checklist.scoringMode === 'scale'
                      ? (checklist.scaleLevels ?? []).find((l) => l.level === result.scaleLevel)?.label ?? '—'
                      : result.checked
                        ? t('checklistReview.checked', 'Marked done')
                        : t('checklistReview.unchecked', 'Not marked')}
                    {' · '}
                    {result.points} {t('checklists.points', 'pts')}
                    {' · '}
                    {hasEvidence
                      ? t('checklistReview.photoAttached', 'photo attached')
                      : flagged
                        ? t('checklistReview.photoMissing', 'photo missing — needs your confirmation')
                        : t('checklistReview.photoNotAttached', 'no photo attached')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    disabled={pending === item.id}
                    onClick={() => void decide(item.id, 'approved')}
                    style={{
                      width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${result.reviewStatus === 'approved' ? COLORS.success : COLORS.border}`,
                      background: result.reviewStatus === 'approved' ? COLORS.success : COLORS.surface,
                      color: result.reviewStatus === 'approved' ? 'var(--color-on-primary)' : COLORS.text,
                    }}
                    aria-label={t('checklistReview.approve', 'Approve')}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    disabled={pending === item.id}
                    onClick={() => void decide(item.id, 'rejected')}
                    style={{
                      width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${result.reviewStatus === 'rejected' ? 'var(--color-danger)' : COLORS.border}`,
                      background: result.reviewStatus === 'rejected' ? 'var(--color-danger)' : COLORS.surface,
                      color: result.reviewStatus === 'rejected' ? 'var(--color-on-primary)' : COLORS.text,
                    }}
                    aria-label={t('checklistReview.reject', 'Reject')}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {result.comment && <p style={{ color: COLORS.text, fontSize: 12.5 }}>{t('checklistReview.learnerComment', 'Learner comment')}: {result.comment}</p>}
              {result.reviewComment && <p style={{ color: COLORS.muted, fontSize: 12.5 }}>{t('checklistReview.previousReviewComment', 'Review comment')}: {result.reviewComment}</p>}
              {hasEvidence && <ChecklistReviewPhotoEvidence instanceId={instance.id} itemId={item.id} result={result} t={t} />}
              {result.reviewStatus === 'pending' && (
                <input
                  placeholder={t('checklistReview.commentPlaceholder', 'Comment (optional)')}
                  value={comment[item.id] ?? ''}
                  onChange={(e) => setComment((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  style={{ marginTop: 10, width: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 20,
          borderRadius: 14,
          padding: '16px 18px',
          background: instance.passed ? COLORS.successSoft : COLORS.warningSoft,
          color: instance.passed ? COLORS.success : COLORS.warning,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{t('checklistReview.currentResult', 'Current result')}</span>
        <strong>{instance.totalScore} / {instance.maxScore} ({instance.percentage}%)</strong>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ color: COLORS.text, fontSize: 14 }}>{t('checklistReview.timeline.title', 'History')}</h3>
        {events === null ? (
          <p style={{ color: COLORS.muted, fontSize: 12.5 }}>{t('checklistReview.timeline.loading', 'Loading history...')}</p>
        ) : events.length === 0 ? (
          <p style={{ color: COLORS.muted, fontSize: 12.5 }}>{t('checklistReview.timeline.empty', 'No history yet.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {events.map((event) => (
              <li key={event.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.muted, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }}>
                <span>{t(`checklistReview.timeline.events.${event.eventType}`, event.eventType)}</span>
                <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
