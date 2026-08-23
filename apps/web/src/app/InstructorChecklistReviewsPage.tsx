import { useState, type ComponentType, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import { listPendingChecklistReviews, reviewChecklistItemResult } from '../shared/api/checklists.js';
import type { ChecklistItemResultSummary, ChecklistItemSummary } from '../shared/api/types.js';
import type { ChecklistInstanceSummary } from '../shared/api/types.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ChecklistReviewsLayout = ComponentType<{ children: ReactNode; firstName?: string; lastName?: string }>;

export function isReviewFlagged(item: ChecklistItemSummary, result: ChecklistItemResultSummary) {
  return item.photoRequired && !result.photoUrl;
}

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
  warning: '#d97706',
  warningSoft: '#fff7e8',
};

type InstructorChecklistReviewsData = { instances: ChecklistInstanceSummary[]; firstName?: string; lastName?: string };

export function InstructorChecklistReviewsPage({ Layout = InstructorPageLayout }: { Layout?: ChecklistReviewsLayout } = {}) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  const { state: loadState, reload: load } = useAsyncData<InstructorChecklistReviewsData>(
    async () => {
      const [instances, currentUser] = await Promise.all([listPendingChecklistReviews(), getCurrentUser()]);
      return { instances, firstName: currentUser?.firstName, lastName: currentUser?.lastName };
    },
    [t],
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

  const open = openId ? loadState.data.instances.find((i) => i.id === openId) : null;

  return (
    <Layout firstName={loadState.data.firstName} lastName={loadState.data.lastName}>
      <div style={{ padding: '24px 0', maxWidth: 860 }}>
        <h1 style={{ color: COLORS.text }}>{t('checklistReview.title', 'Checklist review')}</h1>
        <p style={{ color: COLORS.muted }}>{t('checklistReview.subtitle', 'Checklists submitted by learners that are waiting for your confirmation.')}</p>

        {open ? (
          <ReviewDetail
            instance={open}
            onBack={() => setOpenId(null)}
            onUpdated={load}
            t={t}
          />
        ) : loadState.data.instances.length === 0 ? (
          <PageState message={t('checklistReview.empty', 'Nothing is waiting for review.')} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {loadState.data.instances.map((instance) => (
              <li
                key={instance.id}
                style={{ border: `1px solid ${COLORS.warning}`, background: COLORS.warningSoft, borderRadius: 14, padding: 16, cursor: 'pointer' }}
                onClick={() => setOpenId(instance.id)}
              >
                <strong>{instance.checklist?.title}</strong>
                <p style={{ color: COLORS.muted, marginBottom: 0 }}>{t('checklistReview.submittedBy', 'Submitted by user {{userId}}', { userId: instance.userId })}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

function ReviewDetail({
  instance,
  onBack,
  onUpdated,
  t,
}: {
  instance: ChecklistInstanceSummary;
  onBack: () => void;
  onUpdated: () => Promise<void>;
  t: TFunction;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const checklist = instance.checklist;

  if (!checklist) return null;

  async function decide(itemId: string, status: 'approved' | 'rejected') {
    setPending(itemId);
    setError(null);
    try {
      await reviewChecklistItemResult(instance.id, itemId, { status, comment: comment[itemId] });
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklistReview.saveError', 'Unable to save this decision.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← {t('checklistReview.backToList', 'All pending reviews')}
      </button>

      <h2 style={{ color: COLORS.text, marginBottom: 4 }}>{checklist.title}</h2>
      <p style={{ color: COLORS.muted }}>{t('checklistReview.submittedBy', 'Submitted by user {{userId}}', { userId: instance.userId })}</p>

      {error && <p style={{ color: '#dc2626' }} role="alert">{error}</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.items.map((item) => {
          const result = instance.results.find((r) => r.itemId === item.id);
          if (!result) return null;
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
                    {checklist.scoringMode === 'scale'
                      ? (checklist.scaleLevels ?? []).find((l) => l.level === result.scaleLevel)?.label ?? '—'
                      : result.checked
                        ? t('checklistReview.checked', 'Marked done')
                        : t('checklistReview.unchecked', 'Not marked')}
                    {' · '}
                    {result.points} {t('checklists.points', 'pts')}
                    {' · '}
                    {result.photoUrl ? t('checklistReview.photoAttached', 'photo attached') : flagged ? t('checklistReview.photoMissing', 'photo missing — needs your confirmation') : t('checklistReview.photoNotRequired', 'no photo required')}
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
                      color: result.reviewStatus === 'approved' ? '#fff' : COLORS.text,
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
                      border: `1px solid ${result.reviewStatus === 'rejected' ? '#dc2626' : COLORS.border}`,
                      background: result.reviewStatus === 'rejected' ? '#dc2626' : COLORS.surface,
                      color: result.reviewStatus === 'rejected' ? '#fff' : COLORS.text,
                    }}
                    aria-label={t('checklistReview.reject', 'Reject')}
                  >
                    ✕
                  </button>
                </div>
              </div>
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
          color: instance.passed ? '#166534' : COLORS.warning,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{t('checklistReview.currentResult', 'Current result')}</span>
        <strong>{instance.totalScore} / {instance.maxScore} ({instance.percentage}%)</strong>
      </div>
    </div>
  );
}
