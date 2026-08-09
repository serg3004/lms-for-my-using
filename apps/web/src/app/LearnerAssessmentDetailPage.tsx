import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssessmentAttempts, listAssessmentQuestions } from '../shared/api/assessments.js';
import { ApiClientError, AssessmentSummary, getAssessment } from '../shared/apiClient.js';
import type { AssessmentAttemptSummary } from '../shared/api/types.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { getCourseHref } from '../shared/learnerRoutes.js';
import { PageState } from '../shared/ui.js';

type ReadableAssessmentSummary = AssessmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
};

type AssessmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      assessment: ReadableAssessmentSummary;
      questionCount?: number;
      attempts?: AssessmentAttemptSummary[];
    }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  warning: '#d97706',
  warningSoft: '#fff7e8',
  primarySoft: '#eef2ff',
};

function getCourseTitle(assessment: ReadableAssessmentSummary, fallback: string) {
  return getReadableTitle(assessment.courseTitle ?? assessment.course?.title, fallback);
}

export function LearnerAssessmentDetailPage({ assessmentId }: { assessmentId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssessmentDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssessment() {
      setLoadState({ status: 'loading' });

      try {
        const assessment = await getAssessment(assessmentId);
        const [questions, attempts] = await Promise.all([
          listAssessmentQuestions(assessmentId),
          listAssessmentAttempts(assessmentId),
        ]);

        if (isMounted) {
          setLoadState({ status: 'loaded', assessment, questionCount: questions.length, attempts });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({ status: 'unauthenticated', message: t('assessments.sessionExpired') });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({ status: 'notFound', message: t('assessments.notFound') });
          return;
        }

        setLoadState({ status: 'error', message: t('assessments.loadError') });
      }
    }

    void loadAssessment();

    return () => {
      isMounted = false;
    };
  }, [assessmentId, t]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const assessmentsAction = <a href="/learn/assessments">{t('assessments.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('assessments.loadingDetail')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState title={t('assessments.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState
        title={t('assessments.detailTitle')}
        message={loadState.message}
        variant="error"
        action={assessmentsAction}
      />
    );
  }

  const { assessment } = loadState;
  const courseTitle = getCourseTitle(assessment, 'Course');
  const questionCount = loadState.questionCount ?? 0;
  const attempts = loadState.attempts ?? [];
  const completedAttempts = attempts.filter((a) => a.status === 'completed');
  const bestPercentage = completedAttempts.reduce<number | null>(
    (best, a) => (best === null || a.percentage > best ? a.percentage : best),
    null,
  );
  const attemptsRemaining = Math.max(assessment.maxAttempts - attempts.length, 0);
  const takeHref = `/learn/assessments/${encodeURIComponent(assessment.id)}/take`;
  const isAvailable = assessment.status === 'published';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start', marginBottom: '22px' }}>
        <div>
          <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {t('assessments.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{assessment.title}</h1>
          <p style={{ margin: '10px 0 0', color: COLORS.muted, lineHeight: 1.6, maxWidth: '760px' }}>
            {assessment.description?.trim() || t('assessments.detailSubtitle', { course: courseTitle })}
          </p>
        </div>
        <div style={{ display: 'inline-flex', padding: '9px 12px', borderRadius: '999px', background: COLORS.warningSoft, color: COLORS.warning, fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap' }}>
          {isAvailable ? t('assessments.statusAvailable') : assessment.status}
        </div>
      </div>

      <section
        style={{
          background: 'linear-gradient(135deg,#4338ca,#6d5dfc)',
          color: '#fff',
          borderRadius: '22px',
          padding: '30px',
          marginBottom: '22px',
          boxShadow: '0 18px 45px rgba(67,56,202,.22)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: '24px', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 12px', fontSize: '30px' }}>{t('assessments.heroTitle')}</h2>
            <p style={{ margin: 0, color: '#e0e7ff', lineHeight: 1.65 }}>
              {t('assessments.heroText', { count: questionCount, score: assessment.passingScore })}
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: '18px', padding: '20px' }}>
            <span style={{ display: 'block', color: '#dbeafe', fontSize: '13px', marginBottom: '5px' }}>{t('assessments.metaPassingScore')}</span>
            <strong style={{ fontSize: '42px' }}>{assessment.passingScore}%</strong>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: '22px', alignItems: 'start' }}>
        <article style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assessments.conditionsTitle')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '14px', padding: '16px' }}>
              <span style={{ display: 'block', color: COLORS.muted, fontSize: '12px', marginBottom: '5px' }}>{t('assessments.metaQuestions')}</span>
              <strong style={{ fontSize: '18px' }}>{questionCount}</strong>
            </div>
            <div style={{ border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '14px', padding: '16px' }}>
              <span style={{ display: 'block', color: COLORS.muted, fontSize: '12px', marginBottom: '5px' }}>{t('assessments.metaAttemptsLeft')}</span>
              <strong style={{ fontSize: '18px' }}>{assessment.maxAttempts}</strong>
            </div>
          </div>

          <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assessments.rulesTitle')}</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: '12px', padding: '14px', border: `1px solid ${COLORS.border}`, borderRadius: '14px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '11px', display: 'grid', placeItems: 'center', background: COLORS.primarySoft, color: COLORS.primary, fontWeight: 800 }}>
                  {n}
                </div>
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>{t(`assessments.rule${n}Title`)}</strong>
                  <p style={{ margin: 0, color: COLORS.muted, fontSize: '13px', lineHeight: 1.5 }}>{t(`assessments.rule${n}Text`)}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside style={{ position: 'sticky', top: '98px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assessments.attemptsTitle')}</h3>
          <div style={{ textAlign: 'center', padding: '24px 12px', borderRadius: '16px', background: COLORS.soft, marginBottom: '18px' }}>
            <strong style={{ display: 'block', fontSize: '48px', color: COLORS.text }}>
              {bestPercentage !== null ? `${bestPercentage}%` : '—'}
            </strong>
            <span style={{ color: COLORS.muted }}>
              {bestPercentage !== null ? t('assessments.metaResult') : t('assessments.noAttemptsYet')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.muted }}>{t('assessments.attemptsRemainingLabel')}</span>
            <strong>{attemptsRemaining} {t('assessments.of')} {assessment.maxAttempts}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', padding: '12px 0' }}>
            <span style={{ color: COLORS.muted }}>{t('assessments.statsBest')}</span>
            <strong>{bestPercentage !== null ? `${bestPercentage}%` : t('assessments.noAttemptsYet')}</strong>
          </div>

          {isAvailable ? (
            <div style={{ padding: '14px', borderRadius: '12px', background: COLORS.warningSoft, color: '#8a4b05', fontSize: '13px', lineHeight: 1.5, margin: '18px 0' }}>
              {t('assessments.startNotice')}
            </div>
          ) : null}

          {isAvailable && attemptsRemaining > 0 ? (
            <a
              href={takeHref}
              style={{ display: 'block', textAlign: 'center', width: '100%', border: `1px solid ${COLORS.primary}`, background: COLORS.primary, color: '#fff', borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none', marginBottom: '10px' }}
            >
              {t('assessments.startBtn')}
            </a>
          ) : null}
          <a
            href="/learn/assessments"
            style={{ display: 'block', textAlign: 'center', width: '100%', border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none' }}
          >
            {t('assessments.backToListBtn')}
          </a>
        </aside>
      </div>

      {attempts.length > 0 ? (
        <section
          style={{
            marginTop: '22px',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '18px',
            boxShadow: '0 8px 24px rgba(23,32,51,.05)',
            padding: '24px',
          }}
        >
          <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assessments.attemptsHistoryTitle')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: COLORS.muted, fontSize: '13px' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('assessments.attemptsHistoryDate')}</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('assessments.attemptsHistoryScore')}</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>{t('assessments.attemptsHistoryResult')}</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {attempts
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((attempt) => (
                  <tr key={attempt.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '12px' }}>{formatNullableDate(attempt.completedAt ?? attempt.startedAt, '—')}</td>
                    <td style={{ padding: '12px' }}>
                      {attempt.status === 'completed'
                        ? `${attempt.score} / ${attempt.maxScore} (${attempt.percentage}%)`
                        : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {attempt.status !== 'completed' ? (
                        <span style={{ color: COLORS.muted }}>{t('assessments.attemptsHistoryInProgress')}</span>
                      ) : (
                        <span style={{ color: attempt.passed ? '#0f9f6e' : '#dc2626', fontWeight: 700 }}>
                          {attempt.passed ? t('assessments.resultPassed') : t('assessments.resultFailed')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {attempt.status === 'completed' && !attempt.passed ? (
                        <a href={`/learn/attempts/${encodeURIComponent(attempt.id)}`} style={{ color: COLORS.primary, fontWeight: 600 }}>
                          {t('assessments.attemptsHistoryReview')}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <nav style={{ marginTop: '18px' }}>
        <a href={getCourseHref(assessment.courseId)}>{courseTitle}</a>
      </nav>
    </>
  );
}
