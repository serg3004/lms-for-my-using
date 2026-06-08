import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
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

  const navItems: AdminNavItem[] = [
    { label: t('admin.orgStructure.title', 'Organization structure'), href: '/admin/org-structure', isCurrent: true },
  ];

  useEffect(() => {
    async function loadOrgStructure() {
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
    return (
      <main className="admin-state">
        <PageState message={t('admin.orgStructure.loading', 'Loading organization structure...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.orgStructure.title', 'Organization structure')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const positions = unique(loadState.users.map((user) => user.position));
  const shifts = unique(loadState.users.map((user) => user.shift));

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader title={t('admin.orgStructure.title', 'Organization structure')} />

      <section className="admin-content-grid">
        <AdminCard>
          <h2>{t('admin.orgStructure.organizationsTitle', 'Organizations')}</h2>
          {loadState.organizations.map((item) => (
            <p key={item.id}>{item.name} · {item.slug} · <StatusBadge>{item.status}</StatusBadge></p>
          ))}
        </AdminCard>
        <AdminCard>
          <h2>{t('admin.orgStructure.groupsTitle', 'Groups')}</h2>
          {loadState.groups.map((item) => (
            <p key={item.id}>{item.name} · {item.slug} · <StatusBadge>{item.status}</StatusBadge></p>
          ))}
        </AdminCard>
        <AdminCard>
          <h2>{t('admin.orgStructure.positionsTitle', 'Positions')}</h2>
          {positions.map((item) => <p key={item}>{item}</p>)}
        </AdminCard>
        <AdminCard>
          <h2>{t('admin.orgStructure.shiftsTitle', 'Shifts')}</h2>
          {shifts.map((item) => <p key={item}>{item}</p>)}
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}
