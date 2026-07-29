import { useEffect, useState } from 'react';

import { getCurrentUser, listAssignments, type CurrentUser } from '../shared/apiClient.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';

type Stats = {
  totalAssignments: number;
  active: number;
  completed: number;
  overdue: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; user: CurrentUser; stats: Stats }
  | { status: 'error' };

function computeStats(
  assignments: Awaited<ReturnType<typeof listAssignments>>['items'],
): Stats {
  const now = Date.now();
  let active = 0;
  let completed = 0;
  let overdue = 0;

  for (const a of assignments) {
    if (a.status === 'completed') {
      completed++;
    } else if (a.status === 'assigned') {
      if (a.dueAt && new Date(a.dueAt).getTime() < now) {
        overdue++;
      } else {
        active++;
      }
    }
  }

  return { totalAssignments: assignments.length, active, completed, overdue };
}

export function ManagerDashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [user, assignmentsPage] = await Promise.all([
          getCurrentUser(),
          listAssignments({ pageSize: 200 }),
        ]);

        if (!isMounted) return;

        setState({
          status: 'loaded',
          user,
          stats: computeStats(assignmentsPage.items),
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

  const { user, stats } = state;

  return (
    <ManagerPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <h1>Дашборд менеджера</h1>
      <p>Добро пожаловать, {user.firstName}.</p>

      <section className="admin-content-grid" style={{ marginTop: '1.5rem' }}>
        <StatCard label="Всего назначений" value={stats.totalAssignments} />
        <StatCard label="В процессе" value={stats.active} />
        <StatCard label="Завершено" value={stats.completed} />
        <StatCard label="Просрочено" value={stats.overdue} />
      </section>
    </ManagerPageLayout>
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
