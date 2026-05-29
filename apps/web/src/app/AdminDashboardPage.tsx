import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CurrentUser, getCurrentUser } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

const adminSections = [
  { key: 'users', href: '/admin/users' },
  { key: 'roles', href: '/admin/roles' },
  { key: 'orgStructure', href: '/admin/org-structure' },
  { key: 'courses', href: '/admin/courses' },
  { key: 'assessments', href: '/admin/assessments' },
  { key: 'reports', href: '/admin/reports' },
] as const;

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
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('admin.authRequired', 'Sign in to open the admin area.'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const user = await getCurrentUser();

        if (isMounted) {
          setLoadState({ status: 'authenticated', user });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

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

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('admin.loading', 'Loading admin dashboard...')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('admin.title', 'Admin dashboard')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <h1>{t('admin.title', 'Admin dashboard')}</h1>
        <p role="alert">{loadState.message}</p>
      </main>
    );
  }

  return (
    <main>
      <aside aria-label={t('admin.sidebarLabel', 'Admin navigation')}>
        <a href="/admin">{t('admin.navLink', 'Admin')}</a>
        <nav>
          {adminSections.map((section) => (
            <a href={section.href} key={section.key}>
              {t(`admin.sections.${section.key}.title`, section.key)}
            </a>
          ))}
        </nav>
      </aside>
      <section>
        <header>
          <h1>{t('admin.title', 'Admin dashboard')}</h1>
          <p>{t('admin.subtitle', 'MVP entry point for admin workspace operations.')}</p>
        </header>
        <section>
          <h2>{t('admin.profileTitle', 'Admin profile')}</h2>
          <dl>
            <dt>{t('admin.name', 'Name')}</dt>
            <dd>{getUserDisplayName(loadState.user)}</dd>
            <dt>{t('admin.email', 'Email')}</dt>
            <dd>{loadState.user.email}</dd>
            <dt>{t('admin.organizationId', 'Organization ID')}</dt>
            <dd>{loadState.user.organizationId}</dd>
          </dl>
        </section>
        <section>
          <h2>{t('admin.sectionsTitle', 'Admin sections')}</h2>
          <ul>
            {adminSections.map((section) => (
              <li key={section.key}>
                <a href={section.href}>{t(`admin.sections.${section.key}.title`, section.key)}</a>
                <p>{t(`admin.sections.${section.key}.description`, 'Coming soon.')}</p>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
