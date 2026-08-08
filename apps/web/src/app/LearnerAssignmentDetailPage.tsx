import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssessments } from '../shared/api/assessments.js';
import { getProgressSummary } from '../shared/api/progress.js';
import { ApiClientError, AssignmentSummary, getAssignment } from '../shared/apiClient.js';
import type { AssessmentSummary } from '../shared/api/types.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { getCourseHref } from '../shared/learnerRoutes.js';
import { PageState } from '../shared/ui.js';

type ReadableAssignmentSummary = AssignmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
  userName?: string | null;
  groupName?: string | null;
};

type AssignmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      assignment: ReadableAssignmentSummary;
      progressPercent?: number;
      assessment?: AssessmentSummary | null;
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
  primarySoft: '#eef2ff',
  success: '#0f9f6e',
  warning: '#d97706',
  warningSoft: '#fff7e8',
};

function getCourseTitle(assignment: ReadableAssignmentSummary, fallback: string) {
  return getReadableTitle(assignment.courseTitle ?? assignment.course?.title, fallback);
}

export function LearnerAssignmentDetailPage({ assignmentId }: { assignmentId: string }) {
  const { t, i18n } = useTranslation();
  const [loadState, setLoadState] = useState<AssignmentDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssignment() {
      setLoadState({ status: 'loading' });

      try {
        const assignment = await getAssignment(assignmentId);
        const [progress, assessments] = await Promise.all([
          getProgressSummary(30),
          listAssessments(),
        ]);
        const courseProgress = progress.courses.find((c) => c.courseId === assignment.courseId);
        const assessment = assessments.find((a) => a.courseId === assignment.courseId) ?? null;

        if (isMounted) {
          setLoadState({
            status: 'loaded',
            assignment,
            progressPercent: courseProgress?.percentage,
            assessment,
          });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({ status: 'unauthenticated', message: t('assignments.sessionExpired') });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({ status: 'notFound', message: t('assignments.notFound') });
          return;
        }

        setLoadState({ status: 'error', message: t('assignments.loadError') });
      }
    }

    void loadAssignment();

    return () => {
      isMounted = false;
    };
  }, [assignmentId, t]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const assignmentsAction = <a href="/learn/assignments">{t('assignments.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('assignments.loadingDetail')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState title={t('assignments.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState
        title={t('assignments.detailTitle')}
        message={loadState.message}
        variant="error"
        action={assignmentsAction}
      />
    );
  }

  const { assignment } = loadState;
  const courseTitle = getCourseTitle(assignment, 'Course');
  const progressPercent = loadState.progressPercent ?? 0;
  const assessment = loadState.assessment ?? null;
  const isOverdue = assignment.dueAt != null && new Date(assignment.dueAt).getTime() < Date.now();
  const dueLabel = assignment.dueAt
    ? formatNullableDate(assignment.dueAt, t('assignments.notAvailable'))
    : t('assignments.notAvailable');
  const createdLabel = new Date(assignment.createdAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const assessmentHref = assessment ? `/learn/assessments/${encodeURIComponent(assessment.id)}` : null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start', marginBottom: '22px' }}>
        <div>
          <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {t('assignmentDetail.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>
            {assessment?.title ?? courseTitle}
          </h1>
          <p style={{ margin: '10px 0 0', color: COLORS.muted, lineHeight: 1.6, maxWidth: '760px' }}>
            {t('assignmentDetail.subtitle', { course: courseTitle })}
          </p>
        </div>
        <div style={{ display: 'inline-flex', padding: '9px 12px', borderRadius: '999px', background: COLORS.warningSoft, color: COLORS.warning, fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap' }}>
          {isOverdue ? t('assignmentDetail.statusOverdue') : t('assignmentDetail.statusPending')}
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
            <h2 style={{ margin: '0 0 12px', fontSize: '28px' }}>
              {t('assignmentDetail.heroTitle', { due: dueLabel })}
            </h2>
            <p style={{ margin: 0, color: '#e0e7ff', lineHeight: 1.65 }}>
              {t('assignmentDetail.heroText', { score: assessment?.passingScore ?? '—' })}
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: '18px', padding: '20px', display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#dbeafe', fontSize: '13px' }}>
              <span>{t('assignmentDetail.assignedBy')}</span>
              <strong style={{ color: '#fff' }}>{assignment.userName ?? assignment.groupName ?? t('assignmentDetail.assignedFallback')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#dbeafe', fontSize: '13px' }}>
              <span>{t('assignmentDetail.createdAt')}</span>
              <strong style={{ color: '#fff' }}>{createdLabel}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#dbeafe', fontSize: '13px' }}>
              <span>{t('assignments.dueAt')}</span>
              <strong style={{ color: '#fff' }}>{dueLabel}</strong>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: '22px', alignItems: 'start' }}>
        <article style={{ display: 'grid', gap: '22px' }}>
          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '20px', color: COLORS.text }}>{t('assignmentDetail.descriptionTitle')}</h3>
            <p style={{ margin: '0 0 20px', color: COLORS.muted, lineHeight: 1.6 }}>
              {t('assignmentDetail.descriptionText', { course: courseTitle })}
            </p>

            <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assignmentDetail.requirementsTitle')}</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {[1, 2, 3].map((n) => (
                <div key={n} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: '12px', padding: '14px', border: `1px solid ${COLORS.border}`, borderRadius: '14px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '11px', display: 'grid', placeItems: 'center', background: COLORS.primarySoft, color: COLORS.primary, fontWeight: 800 }}>
                    {n}
                  </div>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>{t(`assignmentDetail.requirement${n}Title`)}</strong>
                    <p style={{ margin: 0, color: COLORS.muted, fontSize: '13px', lineHeight: 1.5 }}>{t(`assignmentDetail.requirement${n}Text`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '20px', color: COLORS.text }}>{t('assignmentDetail.progressTitle')}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: COLORS.muted, fontSize: '13px', marginBottom: '10px' }}>
              <span>{t('assignmentDetail.progressLabel')}</span>
              <strong style={{ color: COLORS.text }}>{progressPercent}%</strong>
            </div>
            <div style={{ height: '10px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: `linear-gradient(90deg,${COLORS.primary},#7c3aed)`, borderRadius: '999px' }} />
            </div>
          </section>
        </article>

        <aside style={{ display: 'grid', gap: '18px' }}>
          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('assignmentDetail.stateTitle')}</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={metaRowStyle}>
                <span style={{ color: COLORS.muted }}>{t('assignments.status')}</span>
                <strong>{isOverdue ? t('assignmentDetail.statusOverdue') : t('assignmentDetail.statusPending')}</strong>
              </div>
              {assessment ? (
                <>
                  <div style={metaRowStyle}>
                    <span style={{ color: COLORS.muted }}>{t('assignmentDetail.attemptsLeft')}</span>
                    <strong>{assessment.maxAttempts} {t('assessments.of', 'из')} {assessment.maxAttempts}</strong>
                  </div>
                  <div style={metaRowStyle}>
                    <span style={{ color: COLORS.muted }}>{t('assessments.metaPassingScore')}</span>
                    <strong>{assessment.passingScore}%</strong>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <div style={{ padding: '14px', borderRadius: '12px', background: COLORS.warningSoft, color: '#8a4b05', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
              {t('assignmentDetail.notice')}
            </div>
            {assessmentHref ? (
              <a
                href={assessmentHref}
                style={{ display: 'block', textAlign: 'center', width: '100%', border: `1px solid ${COLORS.primary}`, background: COLORS.primary, color: '#fff', borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none', marginBottom: '10px' }}
              >
                {t('assessments.startBtn')}
              </a>
            ) : null}
            <a
              href={getCourseHref(assignment.courseId)}
              style={{ display: 'block', textAlign: 'center', width: '100%', border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none', marginBottom: '10px' }}
            >
              {t('assignmentDetail.openCourse')}
            </a>
            <a
              href="/learn/assignments"
              style={{ display: 'block', textAlign: 'center', width: '100%', border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none' }}
            >
              {t('assignmentDetail.backToList')}
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '14px',
};
