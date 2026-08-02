import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCurrentUser, listCourses, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; user: CurrentUser; courses: CourseSummary[] }
  | { status: 'error' };

export function InstructorCoursesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [user, page] = await Promise.all([
          getCurrentUser(),
          listCourses({ pageSize: 100 }),
        ]);
        if (!isMounted) return;
        setState({ status: 'loaded', user, courses: page.items });
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

  const { user, courses } = state;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Курсы</h1>
        <Link to="/instructor/courses/new" className="admin-btn admin-btn--primary">
          Создать курс
        </Link>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Название</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Статус</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Создан</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem' }}>{course.title}</td>
              <td style={{ padding: '0.5rem' }}>{course.status}</td>
              <td style={{ padding: '0.5rem' }}>
                {new Date(course.createdAt).toLocaleDateString('ru-RU')}
              </td>
              <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <Link to={`/instructor/courses/${course.id}/students`}>Студенты</Link>
                <Link to={`/instructor/courses/${course.id}/edit`}>Редактировать</Link>
              </td>
            </tr>
          ))}
          {courses.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>
                Курсов ещё нет.{' '}
                <Link to="/instructor/courses/new">Создать первый курс</Link>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </InstructorPageLayout>
  );
}
