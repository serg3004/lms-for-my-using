import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getCourse,
  getCurrentUser,
  listProgress,
  listUsers,
  type CourseSummary,
  type CurrentUser,
  type ProgressSummary,
  type UserSummary,
} from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  lessonsCompleted: number;
  lessonsInProgress: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; user: CurrentUser; course: CourseSummary; students: StudentRow[] }
  | { status: 'error' };

export function buildStudentRows(
  progressItems: ProgressSummary[],
  users: UserSummary[],
  courseId: string,
): StudentRow[] {
  const courseProgress = progressItems.filter((p) => p.courseId === courseId);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const byUser = new Map<string, { completed: number; inProgress: number }>();

  for (const p of courseProgress) {
    const cur = byUser.get(p.userId) ?? { completed: 0, inProgress: 0 };
    if (p.status === 'completed') cur.completed++;
    else if (p.status === 'in_progress') cur.inProgress++;
    byUser.set(p.userId, cur);
  }

  return [...byUser.entries()].map(([userId, counts]) => {
    const user = userMap.get(userId);
    return {
      userId,
      name: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : userId,
      email: user?.email ?? '—',
      lessonsCompleted: counts.completed,
      lessonsInProgress: counts.inProgress,
    };
  });
}

type InstructorCourseStudentsPageProps = {
  courseId: string;
};

export function InstructorCourseStudentsPage({ courseId }: InstructorCourseStudentsPageProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [currentUser, course, progressPage, usersPage] = await Promise.all([
          getCurrentUser(),
          getCourse(courseId),
          listProgress({ pageSize: 200 }),
          listUsers({ pageSize: 200 }),
        ]);

        if (!isMounted) return;
        setState({
          status: 'loaded',
          user: currentUser,
          course,
          students: buildStudentRows(progressPage.items, usersPage.items, courseId),
        });
      } catch {
        if (isMounted) setState({ status: 'error' });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [courseId]);

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

  const { user, course, students } = state;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link to="/instructor/courses">← Курсы</Link>
        <h1 style={{ margin: 0 }}>Студенты: {course.title}</h1>
      </div>

      <p>Всего студентов: {students.length}</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Имя</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Уроков пройдено</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>В процессе</th>
          </tr>
        </thead>
        <tbody>
          {students.map((row) => (
            <tr key={row.userId} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem' }}>{row.name}</td>
              <td style={{ padding: '0.5rem' }}>{row.email}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{row.lessonsCompleted}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{row.lessonsInProgress}</td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>
                Нет студентов с прогрессом по этому курсу
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </InstructorPageLayout>
  );
}
