import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CurrentUser, getCurrentUser } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import '../styles/admin.css';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getUserDisplayName(user: CurrentUser) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
  return fullName || user.email;
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      setLoadState({ status: 'loading' });

      try {
        const user = await getCurrentUser();

        if (isMounted) {
          setLoadState({ status: 'authenticated', user });
        }
      } catch (error) {
        if (!isMounted) return;

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('admin.sessionExpired', 'Your session expired. Sign in again.'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('admin.loadError', 'Unable to load admin dashboard. Try again later.'),
        });
      }
    }

    void loadCurrentUser();
    return () => { isMounted = false; };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
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

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <h1>{t('admin.title', 'Admin dashboard')}</h1>
        <p role="alert">{loadState.message}</p>
      </main>
    );
  }

  const { user } = loadState;

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
        title={t('admin.title', 'Admin dashboard')}
        subtitle={t('admin.subtitle', 'Welcome back, {{name}}.', { name: getUserDisplayName(user) })}
      />

      <section className="admin-content-grid">
        <AdminCard>
          <h2>{t('admin.profileTitle', 'Admin profile')}</h2>
          <dl className="admin-profile-list">
            <dt>{t('admin.name', 'Name')}</dt>
            <dd>{getUserDisplayName(user)}</dd>
            <dt>{t('admin.email', 'Email')}</dt>
            <dd>{user.email}</dd>
            <dt>{t('admin.organizationId', 'Organization ID')}</dt>
            <dd>{user.organizationId}</dd>
          </dl>
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.sectionsTitle', 'Quick links')}</h2>
          <ul className="admin-section-list">
            <li>
              <a href="/admin/courses">{t('admin.sections.courses.title', 'Courses')}</a>
              <p>{t('admin.sections.courses.description', 'Create and manage training courses.')}</p>
            </li>
            <li>
              <a href="/admin/users">{t('admin.sections.users.title', 'Users')}</a>
              <p>{t('admin.sections.users.description', 'Manage organization members and roles.')}</p>
            </li>
            <li>
              <a href="/admin/assignments">{t('admin.sections.assignments.title', 'Assignments')}</a>
              <p>{t('admin.sections.assignments.description', 'Assign courses to learners.')}</p>
            </li>
            <li>
              <a href="/admin/results">{t('admin.sections.reports.title', 'Results')}</a>
              <p>{t('admin.sections.reports.description', 'View certificates and assessment scores.')}</p>
            </li>
          </ul>
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}
