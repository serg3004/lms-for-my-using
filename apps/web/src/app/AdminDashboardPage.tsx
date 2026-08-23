import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { CurrentUser, apiRequest, getCurrentUser } from '../shared/apiClient.js';
import { listCourses } from '../shared/api/courses.js';
import { listProgress } from '../shared/api/progress.js';
import { listCertificates } from '../shared/api/certificates.js';
import type { PaginatedResponse } from '../shared/api/types.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { SectionHeader, StatCard, StatsGrid, StatusBadge } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type AdminUserStatus = 'active' | 'invited' | 'suspended' | 'archived';

type AdminUserLite = {
  id: string;
  firstName: string;
  lastName: string | null;
  status: AdminUserStatus;
  createdAt: string;
};

type HealthResponse = {
  status: 'ok' | 'error';
  db: 'ok' | 'unavailable';
  redis: 'ok' | 'disabled' | 'unavailable';
  storage: 'ok' | 'disabled' | 'unavailable';
};

type ActivityItem = {
  key: string;
  date: string;
  message: string;
};

type DashboardStats = {
  usersTotal: number;
  coursesTotal: number;
  completionRate: number;
  certificatesTotal: number;
  pendingActivationCount: number;
  systemAvailable: boolean;
  activity: ActivityItem[];
};

type AdminDashboardData = { user: CurrentUser; stats: DashboardStats };

function getUserDisplayName(user: CurrentUser) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
  return fullName || user.email;
}

async function checkSystemAvailable(): Promise<boolean> {
  try {
    const health = await apiRequest<HealthResponse>('/health');
    return health.status === 'ok';
  } catch {
    return false;
  }
}

async function loadDashboardStats(t: TFunction): Promise<DashboardStats> {
  const [usersResult, coursesResult, progressResult, certificatesResult, systemAvailable] = await Promise.all([
    apiRequest<PaginatedResponse<AdminUserLite>>('/users?page=1&pageSize=100'),
    listCourses({ pageSize: 100 }),
    listProgress({ pageSize: 100 }),
    listCertificates({ pageSize: 100 }),
    checkSystemAvailable(),
  ]);

  const users = usersResult.items;
  const completedProgress = progressResult.items.filter((item) => item.completedAt !== null);
  const completionRate = progressResult.items.length
    ? Math.round((completedProgress.length / progressResult.items.length) * 100)
    : 0;

  const userActivity: ActivityItem[] = users.map((user) => ({
    key: `user-${user.id}`,
    date: user.createdAt,
    message: t('admin.dashboard.activity.userAdded', {
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
    }),
  }));

  const certificateActivity: ActivityItem[] = certificatesResult.items.map((certificate) => ({
    key: `certificate-${certificate.id}`,
    date: certificate.issuedAt,
    message: t('admin.dashboard.activity.certificateIssued'),
  }));

  const progressActivity: ActivityItem[] = completedProgress.map((item) => ({
    key: `progress-${item.id}`,
    date: item.completedAt as string,
    message: t('admin.dashboard.activity.lessonCompleted'),
  }));

  const activity = [...userActivity, ...certificateActivity, ...progressActivity]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  return {
    usersTotal: usersResult.total,
    coursesTotal: coursesResult.total,
    completionRate,
    certificatesTotal: certificatesResult.total,
    pendingActivationCount: users.filter((user) => user.status === 'invited').length,
    systemAvailable,
    activity,
  };
}

function downloadDashboardReport(stats: DashboardStats, t: TFunction) {
  const lines = [
    `${t('admin.dashboard.stats.users', 'Users')},${stats.usersTotal}`,
    `${t('admin.dashboard.stats.courses', 'Courses')},${stats.coursesTotal}`,
    `${t('admin.dashboard.stats.completion', 'Completion')},${stats.completionRate}%`,
    `${t('admin.dashboard.stats.certificates', 'Certificates')},${stats.certificatesTotal}`,
    `${t('admin.dashboard.needsAttention.title', 'Needs attention')},${stats.pendingActivationCount}`,
  ].join('\n');

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `admin-dashboard-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminDashboardPage() {
  const { t } = useTranslation();

  const { state: loadState } = useAsyncData<AdminDashboardData>(
    async () => {
      const user = await getCurrentUser();
      const stats = await loadDashboardStats(t);
      return { user, stats };
    },
    [t],
    {
      unauthenticated: t('admin.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.loadError', 'Unable to load admin dashboard. Try again later.'),
    },
  );

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <p>{t('admin.loading', 'Loading admin dashboard...')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <h1>{t('admin.title', 'Admin dashboard')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main className="admin-state">
        <h1>{t('admin.title', 'Admin dashboard')}</h1>
        <p role="alert">{loadState.message}</p>
      </main>
    );
  }

  const { user, stats } = loadState.data;

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
      currentUser={{ firstName: user.firstName, lastName: user.lastName ?? undefined, email: user.email }}
    >
      <AdminPageHeader
        eyebrow={t('admin.eyebrow', 'Administrator')}
        title={t('admin.title', 'Admin dashboard')}
        subtitle={t('admin.subtitle', 'Welcome back, {{name}}.', { name: getUserDisplayName(user) })}
        action={
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => downloadDashboardReport(stats, t)}
            type="button"
          >
            {t('admin.dashboard.downloadReport', 'Download report')}
          </button>
        }
      />

      <StatsGrid>
        <StatCard label={t('admin.dashboard.stats.users', 'Users')} value={stats.usersTotal} />
        <StatCard label={t('admin.dashboard.stats.courses', 'Courses')} value={stats.coursesTotal} />
        <StatCard label={t('admin.dashboard.stats.completion', 'Completion')} value={`${stats.completionRate}%`} />
        <StatCard label={t('admin.dashboard.stats.certificates', 'Certificates')} value={stats.certificatesTotal} />
      </StatsGrid>

      <section className="admin-dashboard-widgets">
        <AdminCard>
          <SectionHeader title={t('admin.dashboard.activity.title', 'Recent activity')} />
          {stats.activity.length === 0 ? (
            <p className="admin-dashboard-widget__empty">{t('admin.dashboard.activity.empty', 'No recent activity.')}</p>
          ) : (
            <ul className="admin-activity-list">
              {stats.activity.map((item) => (
                <li key={item.key}>{item.message}</li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard>
          <SectionHeader title={t('admin.dashboard.needsAttention.title', 'Needs attention')} />
          <p className="admin-dashboard-widget__empty">
            {stats.pendingActivationCount > 0
              ? t('admin.dashboard.needsAttention.pendingUsers', '{{count}} users await activation', {
                  count: stats.pendingActivationCount,
                })
              : t('admin.dashboard.needsAttention.empty', 'Nothing needs attention right now.')}
          </p>
        </AdminCard>

        <AdminCard>
          <SectionHeader title={t('admin.dashboard.systemStatus.title', 'System status')} />
          <StatusBadge tone={stats.systemAvailable ? 'success' : 'danger'}>
            {stats.systemAvailable
              ? t('admin.dashboard.systemStatus.available', 'Available')
              : t('admin.dashboard.systemStatus.unavailable', 'Unavailable')}
          </StatusBadge>
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}
