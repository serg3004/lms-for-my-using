import { useEffect, useState } from 'react';

import { getCurrentUser, listProgress, listUsers, type CurrentUser, type ProgressSummary, type UserSummary } from '../shared/apiClient.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';

type TeamMember = {
  user: UserSummary;
  inProgress: number;
  completed: number;
  total: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; currentUser: CurrentUser; team: TeamMember[] }
  | { status: 'error' };

function buildTeam(users: UserSummary[], progressItems: ProgressSummary[]): TeamMember[] {
  const byUser = new Map<string, { inProgress: number; completed: number }>();

  for (const p of progressItems) {
    const existing = byUser.get(p.userId) ?? { inProgress: 0, completed: 0 };
    if (p.status === 'completed') existing.completed++;
    else if (p.status === 'in_progress') existing.inProgress++;
    byUser.set(p.userId, existing);
  }

  return users.map((user) => {
    const counts = byUser.get(user.id) ?? { inProgress: 0, completed: 0 };
    return { user, ...counts, total: counts.inProgress + counts.completed };
  });
}

export function ManagerTeamPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [currentUser, usersPage, progressPage] = await Promise.all([
          getCurrentUser(),
          listUsers({ pageSize: 200 }),
          listProgress({ pageSize: 200 }),
        ]);

        if (!isMounted) return;

        setState({
          status: 'loaded',
          currentUser,
          team: buildTeam(usersPage.items, progressPage.items),
        });
      } catch {
        if (isMounted) setState({ status: 'error' });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, []);

  if (state.status === 'loading') {
    return (
      <ManagerPageLayout>
        <p role="status">Загрузка...</p>
      </ManagerPageLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <ManagerPageLayout>
        <p role="alert">Не удалось загрузить данные. Попробуйте позже.</p>
      </ManagerPageLayout>
    );
  }

  const { currentUser, team } = state;

  return (
    <ManagerPageLayout firstName={currentUser.firstName} lastName={currentUser.lastName ?? undefined}>
      <h1>Команда</h1>
      <p>Всего сотрудников: {team.length}</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Сотрудник</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>В процессе</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Завершено</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Всего</th>
          </tr>
        </thead>
        <tbody>
          {team.map(({ user, inProgress, completed, total }) => (
            <tr key={user.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem' }}>
                {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
              </td>
              <td style={{ padding: '0.5rem' }}>{user.email}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{inProgress}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{completed}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{total}</td>
            </tr>
          ))}
          {team.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '1rem', textAlign: 'center' }}>
                Нет сотрудников
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ManagerPageLayout>
  );
}
