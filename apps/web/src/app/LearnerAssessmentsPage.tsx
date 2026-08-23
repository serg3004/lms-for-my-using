import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssessmentAttempts, listAssessmentQuestions, listAssessments } from '../shared/api/assessments.js';
import { listCourses } from '../shared/api/courses.js';
import type { AssessmentSummary } from '../shared/api/types.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type AssessmentRow = {
  assessment: AssessmentSummary;
  courseTitle: string;
  questionCount: number;
  attemptsUsed: number;
  bestPercentage: number | null;
  completed: boolean;
};

type LearnerAssessmentsData = { rows: AssessmentRow[] };

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
  primarySoft: '#eef2ff',
};

function getAssessmentHref(assessmentId: string) {
  return `/learn/assessments/${encodeURIComponent(assessmentId)}`;
}

type StatusFilter = 'all' | 'available' | 'completed';

export function LearnerAssessmentsPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const { state: loadState } = useAsyncData<LearnerAssessmentsData>(
    async () => {
      const [assessments, coursesResult] = await Promise.all([listAssessments(), listCourses({ page: 1, pageSize: 100 })]);
      const courseTitleById = new Map(coursesResult.items.map((course) => [course.id, course.title]));

      const rows = await Promise.all(
        assessments.map(async (assessment): Promise<AssessmentRow> => {
          const [questions, attempts] = await Promise.all([
            listAssessmentQuestions(assessment.id),
            listAssessmentAttempts(assessment.id),
          ]);
          const completedAttempts = attempts.filter((attempt) => attempt.status === 'completed');
          const bestPercentage = completedAttempts.reduce<number | null>(
            (best, attempt) => (best === null || attempt.percentage > best ? attempt.percentage : best),
            null,
          );

          return {
            assessment,
            courseTitle: courseTitleById.get(assessment.courseId) ?? '',
            questionCount: questions.length,
            attemptsUsed: attempts.length,
            bestPercentage,
            completed: completedAttempts.some((attempt) => attempt.passed),
          };
        }),
      );

      return { rows };
    },
    [t],
    { unauthenticated: t('assessments.sessionExpired'), error: t('assessments.loadError') },
  );

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const learnerAction = <a href="/learn">{t('learner.navLink')}</a>;

  const courseOptions = useMemo(() => {
    if (loadState.status !== 'loaded') return [];
    const seen = new Map<string, string>();
    for (const row of loadState.data.rows) {
      if (!seen.has(row.assessment.courseId)) seen.set(row.assessment.courseId, row.courseTitle);
    }
    return [...seen.entries()];
  }, [loadState]);

  const filteredRows = useMemo(() => {
    if (loadState.status !== 'loaded') return [];
    const q = query.trim().toLowerCase();
    return loadState.data.rows.filter((row) => {
      const matchesQuery = !q || row.assessment.title.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'completed' ? row.completed : !row.completed);
      const matchesCourse = courseFilter === 'all' || row.assessment.courseId === courseFilter;
      return matchesQuery && matchesStatus && matchesCourse;
    });
  }, [loadState, query, statusFilter, courseFilter]);

  if (loadState.status === 'loading') {
    return <PageState message={t('assessments.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState title={t('assessments.title')} message={loadState.message} variant="error" action={loginAction} />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState title={t('assessments.title')} message={loadState.message} variant="error" action={learnerAction} />
    );
  }

  const { rows } = loadState.data;
  const availableCount = rows.filter((r) => !r.completed).length;
  const completedCount = rows.filter((r) => r.completed).length;
  const bestScores = rows.map((r) => r.bestPercentage).filter((v): v is number => v !== null);
  const bestScore = bestScores.length > 0 ? Math.max(...bestScores) : null;

  return (
    <>
      <div style={{ marginBottom: '22px' }}>
        <div
          style={{
            color: COLORS.primary,
            fontSize: '12px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          {t('assessments.eyebrow')}
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>
          {t('assessments.title')}
        </h1>
        <p style={{ margin: '10px 0 0', color: COLORS.muted, fontSize: '15px', maxWidth: '760px', lineHeight: 1.6 }}>
          {t('assessments.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '22px' }}>
        {[
          { value: availableCount, label: t('assessments.statsAvailable') },
          { value: completedCount, label: t('assessments.statsCompleted') },
          { value: bestScore !== null ? `${bestScore}%` : '—', label: t('assessments.statsBest') },
        ].map((s, i) => (
          <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '14px', padding: '18px' }}>
            <strong style={{ display: 'block', fontSize: '28px', color: COLORS.text }}>{s.value}</strong>
            <span style={{ color: COLORS.muted, fontSize: '13px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'center' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('assessments.searchPlaceholder')}
          style={{ flex: 1, minWidth: '220px', border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '12px', padding: '11px 13px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('assessments.filterAll')}</option>
          <option value="available">{t('assessments.filterAvailable')}</option>
          <option value="completed">{t('assessments.filterCompleted')}</option>
        </select>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('assessments.filterAllCourses')}</option>
          {courseOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px' }}>
          <strong style={{ display: 'block', fontSize: '22px', margin: '10px 0 6px', color: COLORS.text }}>
            {t('assessments.empty')}
          </strong>
          <span style={{ color: COLORS.muted }}>{t('assessments.emptyHint')}</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
          {filteredRows.map((row) => {
            const { assessment } = row;
            const badgeBg = row.completed ? COLORS.successSoft : COLORS.primarySoft;
            const badgeColor = row.completed ? COLORS.success : COLORS.primary;
            const badgeLabel = row.completed ? t('assessments.statusCompleted') : t('assessments.statusAvailable');
            const attemptsRemaining = Math.max(assessment.maxAttempts - row.attemptsUsed, 0);

            return (
              <article
                key={assessment.id}
                style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '20px',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 10px 28px rgba(23,32,51,.07)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', display: 'grid', placeItems: 'center', background: COLORS.primarySoft, color: COLORS.primary, fontWeight: 900 }}>
                    {row.completed ? '★' : '✓'}
                  </div>
                  <span style={{ borderRadius: '999px', padding: '7px 10px', fontSize: '12px', fontWeight: 800, background: badgeBg, color: badgeColor }}>
                    {badgeLabel}
                  </span>
                </div>

                <h2 style={{ fontSize: '19px', margin: '0 0 6px', color: COLORS.text, fontWeight: 800 }}>{assessment.title}</h2>
                {row.courseTitle ? (
                  <div style={{ color: COLORS.muted, fontSize: '13px', marginBottom: '14px' }}>
                    {t('assessments.courseLabel', { course: row.courseTitle })}
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
                  {row.completed ? (
                    <>
                      <div style={{ padding: '11px', background: COLORS.soft, borderRadius: '12px' }}>
                        <span style={{ display: 'block', color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
                          {t('assessments.metaResult')}
                        </span>
                        <strong style={{ fontSize: '14px', color: COLORS.text }}>{row.bestPercentage}%</strong>
                      </div>
                      <div style={{ padding: '11px', background: COLORS.soft, borderRadius: '12px' }}>
                        <span style={{ display: 'block', color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
                          {t('assessments.metaAttempt')}
                        </span>
                        <strong style={{ fontSize: '14px', color: COLORS.text }}>
                          {row.attemptsUsed} {t('assessments.of')} {assessment.maxAttempts}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ padding: '11px', background: COLORS.soft, borderRadius: '12px' }}>
                        <span style={{ display: 'block', color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
                          {t('assessments.metaQuestions')}
                        </span>
                        <strong style={{ fontSize: '14px', color: COLORS.text }}>{row.questionCount}</strong>
                      </div>
                      <div style={{ padding: '11px', background: COLORS.soft, borderRadius: '12px' }}>
                        <span style={{ display: 'block', color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
                          {t('assessments.metaAttemptsLeft')}
                        </span>
                        <strong style={{ fontSize: '14px', color: COLORS.text }}>{attemptsRemaining}</strong>
                      </div>
                      <div style={{ padding: '11px', background: COLORS.soft, borderRadius: '12px' }}>
                        <span style={{ display: 'block', color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
                          {t('assessments.metaPassingScore')}
                        </span>
                        <strong style={{ fontSize: '14px', color: COLORS.text }}>{assessment.passingScore}%</strong>
                      </div>
                    </>
                  )}
                </div>

                {row.completed && row.bestPercentage !== null ? (
                  <div style={{ height: '9px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden', marginBottom: '18px' }}>
                    <div style={{ width: `${row.bestPercentage}%`, height: '100%', background: COLORS.success, borderRadius: '999px' }} />
                  </div>
                ) : null}

                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  <a
                    href={getAssessmentHref(assessment.id)}
                    style={{ flex: 1, border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 14px', fontWeight: 800, fontSize: '14px', textAlign: 'center', textDecoration: 'none', color: COLORS.text }}
                  >
                    {t('assessments.actionDetails')}
                  </a>
                  {!row.completed && (
                    <a
                      href={getAssessmentHref(assessment.id)}
                      style={{ flex: 1, border: `1px solid ${COLORS.primary}`, background: COLORS.primary, borderRadius: '12px', padding: '11px 14px', fontWeight: 800, fontSize: '14px', textAlign: 'center', textDecoration: 'none', color: '#fff' }}
                    >
                      {t('assessments.actionStart')}
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
