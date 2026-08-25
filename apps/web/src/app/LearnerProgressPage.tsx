import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { getProgressSummary } from '../shared/api/progress.js';
import type { ProgressSummaryReport } from '../shared/api/types.js';
import { getCourseHref } from '../shared/learnerRoutes.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type Period = 30 | 90 | 365;

const COLORS = {
  bg: '#f4f7fb',
  surface: '#ffffff',
  surfaceSoft: '#f8fafc',
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

function formatActivityDate(dateIso: string, t: TFunction, locale: string): string {
  const date = new Date(dateIso);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, now)) {
    return `${t('progress.today')}, ${time}`;
  }
  if (isSameDay(date, yesterday)) {
    return `${t('progress.yesterday')}, ${time}`;
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '14px',
      padding: '18px', boxShadow: '0 6px 18px rgba(23,32,51,.04)',
    }}>
      <strong style={{ display: 'block', fontSize: '28px', marginBottom: '5px', color: COLORS.text }}>{value}</strong>
      <span style={{ color: COLORS.muted, fontSize: '13px' }}>{label}</span>
    </div>
  );
}

function CourseProgressBar({ pct, success }: { pct: number; success?: boolean }) {
  return (
    <div style={{ height: '9px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: '999px', width: `${pct}%`,
        background: success ? COLORS.success : `linear-gradient(90deg,${COLORS.primary},#7c3aed)`,
      }}
      />
    </div>
  );
}

function downloadProgressReport(data: ProgressSummaryReport, t: TFunction) {
  const lines = [
    `${t('progress.stats.overallProgress')},${data.overallProgressPercent}%`,
    `${t('progress.stats.lessonsCompleted')},${data.lessonsCompletedCount}`,
    `${t('progress.stats.activeDays')},${data.activeDaysCount}`,
    `${t('progress.stats.avgScore')},${data.avgAssessmentScore ?? ''}`,
    '',
    [t('progress.coursesTitle'), '', '', '', '', ''].join(','),
    ...data.courses.map((course) =>
      [
        course.title,
        `${course.completedLessons}/${course.totalLessons}`,
        `${course.percentage}%`,
        course.status === 'completed' ? t('progress.statusCompleted') : t('progress.statusInProgress'),
        course.latestAssessmentScore !== null ? `${course.latestAssessmentScore}%` : '',
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `progress-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LearnerProgressPage() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<Period>(30);

  const { state: loadState } = useAsyncData<ProgressSummaryReport>(
    () => getProgressSummary(period),
    [t, period],
    { unauthenticated: t('progress.sessionExpired'), error: t('progress.loadError') },
  );

  if (loadState.status === 'loading') {
    return <PageState message={t('progress.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        title={t('progress.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/login">{t('login.navLink')}</a>}
      />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState
        title={t('progress.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/learn">{t('learner.navLink')}</a>}
      />
    );
  }

  const { data } = loadState;
  const streakDays = t('progress.streakDays', { returnObjects: true }) as string[];
  const weeklyGoalPct = Math.round(Math.min(100, (data.weeklyGoal.completed / Math.max(data.weeklyGoal.target, 1)) * 100));
  const remaining = Math.max(0, data.weeklyGoal.target - data.weeklyGoal.completed);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
            {t('progress.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,38px)', fontWeight: 800, color: COLORS.text }}>
            {t('progress.title')}
          </h1>
          <p style={{ margin: '10px 0 0', color: COLORS.muted, lineHeight: 1.6, maxWidth: '760px', fontSize: '14px' }}>
            {t('progress.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value) as Period)}
            style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px', color: COLORS.text, fontSize: '14px' }}
          >
            <option value={30}>{t('progress.period30')}</option>
            <option value={90}>{t('progress.period90')}</option>
            <option value={365}>{t('progress.period365')}</option>
          </select>
          <button
            type="button"
            onClick={() => downloadProgressReport(data, t)}
            style={{ border: `1px solid ${COLORS.primary}`, background: COLORS.primary, color: '#fff', borderRadius: '12px', padding: '11px 14px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}
          >
            {t('progress.downloadReport')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '16px', marginBottom: '22px' }}>
        <StatCard value={`${data.overallProgressPercent}%`} label={t('progress.stats.overallProgress')} />
        <StatCard value={data.lessonsCompletedCount} label={t('progress.stats.lessonsCompleted')} />
        <StatCard value={data.activeDaysCount} label={t('progress.stats.activeDays')} />
        <StatCard
          value={data.avgAssessmentScore !== null ? `${data.avgAssessmentScore}%` : t('progress.stats.notAvailable')}
          label={t('progress.stats.avgScore')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(320px,.7fr)', gap: '22px', alignItems: 'start' }}>
        <article style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('progress.coursesTitle')}</h3>

          {data.courses.length === 0 ? (
            <p style={{ color: COLORS.muted, margin: 0 }}>{t('progress.coursesEmpty')}</p>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {data.courses.map((course) => (
                <a key={course.courseId} href={getCourseHref(course.courseId)} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    border: `1px solid ${COLORS.border}`, borderRadius: '16px', padding: '16px',
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: '18px', alignItems: 'center',
                  }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 6px', fontSize: '17px', color: COLORS.text }}>{course.title}</h4>
                      <p style={{ margin: '0 0 12px', color: COLORS.muted, fontSize: '13px' }}>
                        {t('progress.lessonsProgress', { completed: course.completedLessons, total: course.totalLessons })}
                        {' · '}
                        {course.latestAssessmentScore !== null
                          ? t('progress.scoreLabel', { score: course.latestAssessmentScore })
                          : t('progress.scoreUnavailable')}
                      </p>
                      <CourseProgressBar pct={course.percentage} success={course.status === 'completed'} />
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ display: 'block', fontSize: '26px', color: COLORS.text }}>{course.percentage}%</strong>
                      <span style={{ color: COLORS.muted, fontSize: '12px' }}>
                        {course.status === 'completed' ? t('progress.statusCompleted') : t('progress.statusInProgress')}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </article>

        <aside>
          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('progress.weeklyGoalTitle')}</h3>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{
                width: '150px', height: '150px', borderRadius: '50%', margin: '0 auto', display: 'grid', placeItems: 'center',
                background: `radial-gradient(circle at center,${COLORS.surface} 58%,transparent 59%), conic-gradient(${COLORS.primary} 0 ${weeklyGoalPct}%,#edf0f5 ${weeklyGoalPct}% 100%)`,
              }}
              >
                <strong style={{ fontSize: '30px', color: COLORS.text }}>{data.weeklyGoal.completed}/{data.weeklyGoal.target}</strong>
              </div>
              <div style={{ textAlign: 'center', color: COLORS.muted, lineHeight: 1.55 }}>
                {remaining === 0 ? t('progress.weeklyGoalDone') : t('progress.weeklyGoalRemaining', { count: remaining })}
              </div>
            </div>
          </section>

          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px', marginTop: '18px' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('progress.streakTitle')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '8px' }}>
              {data.streak.map((day) => (
                <div key={day.date} style={{ textAlign: 'center', color: COLORS.muted, fontSize: '11px' }}>
                  {streakDays[day.dayOfWeek]}
                  <span style={{
                    width: '36px', height: '36px', margin: '6px auto 0', borderRadius: '10px', display: 'grid', placeItems: 'center',
                    background: day.active ? COLORS.primarySoft : COLORS.surfaceSoft,
                    border: `1px solid ${day.active ? '#c7d2fe' : COLORS.border}`,
                    color: day.active ? COLORS.primary : COLORS.muted,
                    fontWeight: day.active ? 800 : 400,
                  }}
                  >
                    {day.active ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px', marginTop: '22px' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('progress.activityTitle')}</h3>

        {data.recentActivity.length === 0 ? (
          <p style={{ color: COLORS.muted, margin: 0 }}>{t('progress.activityEmpty')}</p>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {data.recentActivity.map((item, index) => {
              const icon = item.type === 'lesson_completed' ? '✓' : item.type === 'assessment_passed' ? `${item.score}%` : '★';
              const iconBg = item.type === 'lesson_completed' ? COLORS.successSoft : item.type === 'assessment_passed' ? COLORS.primarySoft : COLORS.warningSoft;
              const iconColor = item.type === 'lesson_completed' ? COLORS.success : item.type === 'assessment_passed' ? COLORS.primary : COLORS.warning;
              const message =
                item.type === 'lesson_completed'
                  ? t('progress.activity.lessonCompleted', { course: item.courseTitle })
                  : item.type === 'assessment_passed'
                    ? t('progress.activity.assessmentPassed', { course: item.courseTitle, score: item.score })
                    : t('progress.activity.certificateIssued', { course: item.courseTitle });

              return (
                <div key={`${item.type}-${item.courseId}-${index}`} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: '12px', alignItems: 'start' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'grid', placeItems: 'center', background: iconBg, color: iconColor, fontWeight: 800 }}>
                    {icon}
                  </div>
                  <div>
                    <p style={{ margin: 0, color: COLORS.text }}>{message}</p>
                    <time style={{ display: 'block', marginTop: '5px', color: '#9ca3af', fontSize: '11px' }}>
                      {formatActivityDate(item.date, t, i18n.resolvedLanguage ?? i18n.language)}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
