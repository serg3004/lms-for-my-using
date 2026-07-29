import { useEffect, useState } from 'react';

import { getCurrentUser, listCourses, listProgress, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';

type Stats = {
  total: number;
  published: number;
  draft: number;
  studentsEnrolled: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; user: CurrentUser; stats: Stats }
  | { status: 'error' };

function computeStats(courses: CourseSummary[], progressItems: { userId: string }[]): Stats {
  const published = courses.filter((c) => c.status === 'published').length;
  const draft = courses.filter((c) => c.status !== 'published').length;
  const studentsEnrolled = new Set(progressItems.map((p) => p.userId)).size;
  return { total: courses.length, published, draft, studentsEnrolled };
}

export function InstructorDashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [user, coursesPage, progressPage] = await Promise.all([
          getCurrentUser(),
          listCourses({ pageSize: 200 }),
          listProgress({ pageSize: 200 }),
        ]);

        if (!isMounted) return;
        setState({ status: 'loaded', user, stats: computeStats(coursesPage.items, progressPage.items) });
      } catch {
        if (isMounted) setState({ status: 'error' });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, []);

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

  const { user, stats } = state;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <h1>Дашборд инструктора</h1>
      <p>Добро пожаловать, {user.firstName}.</p>

      <section className="admin-content-grid" style={{ marginTop: '1.5rem' }}>
        <StatCard label="Всего курсов" value={stats.total} />
        <StatCard label="Опубликовано" value={stats.published} />
        <StatCard label="Черновики" value={stats.draft} />
        <StatCard label="Студентов записано" value={stats.studentsEnrolled} />
      </section>
    </InstructorPageLayout>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>{value}</p>
      <p style={{ margin: '0.25rem 0 0' }}>{label}</p>
    </div>
  );
}
