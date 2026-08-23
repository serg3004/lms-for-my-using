import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  getCourse,
  getCurrentUser,
  listProgress,
  type CourseSummary,
  type CurrentUser,
  type ProgressSummary,
} from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  lessonsCompleted: number;
  lessonsInProgress: number;
  avgScore: number | null;
  status: 'completed' | 'in_progress';
};

type InstructorCourseStudentsData = { user: CurrentUser; course: CourseSummary; students: StudentRow[] };

export function buildStudentRows(
  progressItems: ProgressSummary[],
  courseId: string,
): StudentRow[] {
  const courseProgress = progressItems.filter((p) => p.courseId === courseId);
  const byUser = new Map<string, {
    completed: number;
    inProgress: number;
    scores: number[];
    user: ProgressSummary['user'];
  }>();

  for (const p of courseProgress) {
    const cur = byUser.get(p.userId) ?? { completed: 0, inProgress: 0, scores: [], user: p.user };
    if (p.status === 'completed') cur.completed++;
    else if (p.status === 'in_progress') cur.inProgress++;
    if (p.score != null) cur.scores.push(p.score);
    cur.user ??= p.user;
    byUser.set(p.userId, cur);
  }

  return [...byUser.entries()].map(([userId, counts]) => {
    const user = counts.user;
    const avgScore =
      counts.scores.length > 0
        ? Math.round(counts.scores.reduce((sum, s) => sum + s, 0) / counts.scores.length)
        : null;
    return {
      userId,
      name: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : userId,
      email: user?.email ?? '—',
      lessonsCompleted: counts.completed,
      lessonsInProgress: counts.inProgress,
      avgScore,
      status: counts.inProgress === 0 && counts.completed > 0 ? 'completed' : 'in_progress',
    };
  });
}

function downloadStudentsCsv(course: CourseSummary, students: StudentRow[], t: TFunction) {
  const lines = [
    [
      t('instructor.courseStudents.colName'),
      t('instructor.courseStudents.colEmail'),
      t('instructor.courseStudents.colStatus'),
      t('instructor.courseStudents.colCompleted'),
      t('instructor.courseStudents.colInProgress'),
      t('instructor.courseStudents.colScore'),
    ].join(','),
    ...students.map((row) =>
      [
        row.name,
        row.email,
        row.status === 'completed' ? t('instructor.courseStudents.statusCompleted') : t('instructor.courseStudents.statusInProgress'),
        String(row.lessonsCompleted),
        String(row.lessonsInProgress),
        row.avgScore != null ? `${row.avgScore}%` : '',
      ]
        .map((value) => `"${value.replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${course.slug || course.id}-students.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type InstructorCourseStudentsPageProps = {
  courseId: string;
};

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
  primarySoft: '#eef2ff',
};

export function InstructorCourseStudentsPage({ courseId }: InstructorCourseStudentsPageProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress'>('all');

  const { state } = useAsyncData<InstructorCourseStudentsData>(
    async () => {
      const [currentUser, course, progressPage] = await Promise.all([
        getCurrentUser(),
        getCourse(courseId),
        listProgress({ pageSize: 100 }),
      ]);

      return { user: currentUser, course, students: buildStudentRows(progressPage.items, courseId) };
    },
    [courseId, t],
    { unauthenticated: t('instructor.courseStudents.loadError'), error: t('instructor.courseStudents.loadError') },
  );

  const filteredStudents = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const q = search.trim().toLowerCase();
    return state.data.students.filter((row) => {
      const matchesSearch = !q || row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state, search, statusFilter]);

  if (state.status === 'loading') {
    return (
      <InstructorPageLayout>
        <p role="status">{t('instructor.courseStudents.loading')}</p>
      </InstructorPageLayout>
    );
  }

  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return (
      <InstructorPageLayout>
        <p role="alert">{t('instructor.courseStudents.loadError')}</p>
      </InstructorPageLayout>
    );
  }

  const { user, course, students } = state.data;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link to="/instructor/courses">← {t('instructor.courseStudents.backToCourses')}</Link>
        <h1 style={{ margin: 0 }}>{t('instructor.courseStudents.title', { course: course.title })}</h1>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('instructor.courseStudents.searchPlaceholder')}
          style={{ flex: 1, minWidth: '220px', border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '12px', padding: '11px 13px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'in_progress')}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('instructor.courseStudents.allStatuses')}</option>
          <option value="completed">{t('instructor.courseStudents.statusCompleted')}</option>
          <option value="in_progress">{t('instructor.courseStudents.statusInProgress')}</option>
        </select>
        <button
          type="button"
          onClick={() => downloadStudentsCsv(course, filteredStudents, t)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 14px', fontWeight: 700, fontSize: '14px' }}
        >
          {t('instructor.courseStudents.export')}
        </button>
      </div>

      <p style={{ color: COLORS.muted }}>{t('instructor.courseStudents.totalStudents', { count: students.length })}</p>

      <table aria-label={t('instructor.courseStudents.title')} style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>{t('instructor.courseStudents.colName')}</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>{t('instructor.courseStudents.colEmail')}</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>{t('instructor.courseStudents.colStatus')}</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>{t('instructor.courseStudents.colCompleted')}</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>{t('instructor.courseStudents.colInProgress')}</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>{t('instructor.courseStudents.colScore')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredStudents.map((row) => (
            <tr key={row.userId} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem' }}>{row.name}</td>
              <td style={{ padding: '0.5rem' }}>{row.email}</td>
              <td style={{ padding: '0.5rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    padding: '5px 9px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: row.status === 'completed' ? COLORS.successSoft : COLORS.primarySoft,
                    color: row.status === 'completed' ? COLORS.success : COLORS.primary,
                  }}
                >
                  {row.status === 'completed' ? t('instructor.courseStudents.statusCompleted') : t('instructor.courseStudents.statusInProgress')}
                </span>
              </td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{row.lessonsCompleted}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{row.lessonsInProgress}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{row.avgScore != null ? `${row.avgScore}%` : '—'}</td>
            </tr>
          ))}
          {filteredStudents.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '1rem', textAlign: 'center' }}>
                {t('instructor.courseStudents.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </InstructorPageLayout>
  );
}
