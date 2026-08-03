import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCurrentUser, listCourses, listProgress, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; user: CurrentUser; courses: CourseSummary[]; studentCounts: Map<string, number> }
  | { status: 'error' };

type StatusFilter = 'all' | 'published' | 'draft' | 'archived';

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
};

export function InstructorCoursesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [user, page, { items: progressItems }] = await Promise.all([
          getCurrentUser(),
          listCourses({ pageSize: 100 }),
          listProgress({ pageSize: 100 }),
        ]);
        if (!isMounted) return;
        const studentsByCourse = new Map<string, Set<string>>();
        for (const progress of progressItems) {
          const set = studentsByCourse.get(progress.courseId) ?? new Set<string>();
          set.add(progress.userId);
          studentsByCourse.set(progress.courseId, set);
        }
        const counts = new Map<string, number>();
        for (const [courseId, students] of studentsByCourse) counts.set(courseId, students.size);
        setState({ status: 'loaded', user, courses: page.items, studentCounts: counts });
      } catch {
        if (isMounted) setState({ status: 'error' });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, []);

  const filteredCourses = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const q = search.trim().toLowerCase();
    return state.courses.filter((course) => {
      const matchesSearch = !q || course.title.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state, search, statusFilter]);

  if (state.status === 'loading') {
    return (
      <InstructorPageLayout>
        <p role="status">Загрузка...</p>
      </InstructorPageLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <InstructorPageLayout>
        <p role="alert">Не удалось загрузить данные. Попробуйте позже.</p>
      </InstructorPageLayout>
    );
  }

  const { user, studentCounts } = state;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Курсы</h1>
        <Link to="/instructor/courses/new" className="admin-btn admin-btn--primary">
          Создать курс
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск курсов..."
          style={{ flex: 1, minWidth: '220px', border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '12px', padding: '11px 13px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">Все статусы</option>
          <option value="published">Опубликован</option>
          <option value="draft">Черновик</option>
          <option value="archived">Архив</option>
        </select>
      </div>

      {filteredCourses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '16px' }}>
          <p style={{ margin: 0, color: COLORS.muted }}>
            Курсов ещё нет. <Link to="/instructor/courses/new">Создать первый курс</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredCourses.map((course) => {
            const isPublished = course.status === 'published';
            const badgeBg = isPublished ? COLORS.successSoft : COLORS.primarySoft;
            const badgeColor = isPublished ? COLORS.success : COLORS.primary;
            const badgeLabel = isPublished ? 'Опубликован' : course.status === 'archived' ? 'Архив' : 'Черновик';
            const studentCount = studentCounts.get(course.id) ?? 0;

            return (
              <article
                key={course.id}
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '17px', color: COLORS.text }}>{course.title}</h2>
                  <span style={{ borderRadius: '999px', padding: '6px 9px', fontSize: '11px', fontWeight: 800, background: badgeBg, color: badgeColor, whiteSpace: 'nowrap' }}>
                    {badgeLabel}
                  </span>
                </div>
                <div style={{ color: COLORS.muted, fontSize: '13px' }}>
                  {studentCount} {studentCount === 1 ? 'ученик' : 'учеников'} · {new Date(course.createdAt).toLocaleDateString('ru-RU')}
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                  <Link
                    to={`/instructor/courses/${course.id}/students`}
                    style={{ flex: 1, textAlign: 'center', border: `1px solid ${COLORS.border}`, borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontWeight: 700, color: COLORS.text, textDecoration: 'none' }}
                  >
                    Студенты
                  </Link>
                  <Link
                    to={`/instructor/courses/${course.id}/edit`}
                    style={{ flex: 1, textAlign: 'center', border: `1px solid ${COLORS.primary}`, background: COLORS.primary, borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontWeight: 700, color: '#fff', textDecoration: 'none' }}
                  >
                    Редактировать
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </InstructorPageLayout>
  );
}
