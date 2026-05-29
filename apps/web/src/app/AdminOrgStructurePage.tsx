import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';
import { PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Organization = { id: string; name: string; slug: string; status: string };
type Group = { id: string; name: string; slug: string; status: string };
type User = { id: string; email: string; position: string | null; shift: string | null };

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; organizations: Organization[]; groups: Group[]; users: User[] }
  | { status: 'error'; message: string };

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function AdminOrgStructurePage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    async function loadOrgStructure() {
      if (!getAuthToken()) {
        setLoadState({ status: 'error', message: t('admin.orgStructure.authRequired', 'Sign in to manage organization structure.') });
        return;
      }

      try {
        const [organizations, groups, users] = await Promise.all([
          apiRequest<Organization[]>('/organizations'),
          apiRequest<Group[]>('/groups'),
          apiRequest<User[]>('/users'),
        ]);
        setLoadState({ status: 'loaded', organizations, groups, users });
      } catch {
        setLoadState({ status: 'error', message: t('admin.orgStructure.loadError', 'Unable to load organization structure.') });
      }
    }

    void loadOrgStructure();
  }, [t]);

  if (loadState.status === 'loading') {
    return <PageState message={t('admin.orgStructure.loading', 'Loading organization structure...')} variant="loading" />;
  }

  if (loadState.status === 'error') {
    return <PageState title={t('admin.orgStructure.title', 'Organization structure')} message={loadState.message} variant="error" />;
  }

  const positions = unique(loadState.users.map((user) => user.position));
  const shifts = unique(loadState.users.map((user) => user.shift));

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin">{t('admin.navLink', 'Admin')}</a>
        <nav className="admin-nav">
          <a className="admin-nav-link" href="/admin/users">{t('admin.users.title', 'Users')}</a>
          <a className="admin-nav-link" href="/admin/roles">{t('admin.roles.title', 'Roles')}</a>
          <a className="admin-nav-link" href="/admin/org-structure" aria-current="page">{t('admin.orgStructure.title', 'Organization structure')}</a>
        </nav>
      </aside>

      <section className="admin-shell">
        <h1>{t('admin.orgStructure.title', 'Organization structure')}</h1>
        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.orgStructure.organizationsTitle', 'Organizations')}</h2>
            {loadState.organizations.map((item) => <p key={item.id}>{item.name} · {item.slug} · <StatusBadge>{item.status}</StatusBadge></p>)}
          </article>
          <article className="admin-card">
            <h2>{t('admin.orgStructure.groupsTitle', 'Groups')}</h2>
            {loadState.groups.map((item) => <p key={item.id}>{item.name} · {item.slug} · <StatusBadge>{item.status}</StatusBadge></p>)}
          </article>
          <article className="admin-card"><h2>{t('admin.orgStructure.positionsTitle', 'Positions')}</h2>{positions.map((item) => <p key={item}>{item}</p>)}</article>
          <article className="admin-card"><h2>{t('admin.orgStructure.shiftsTitle', 'Shifts')}</h2>{shifts.map((item) => <p key={item}>{item}</p>)}</article>
        </section>
      </section>
    </main>
  );
}
