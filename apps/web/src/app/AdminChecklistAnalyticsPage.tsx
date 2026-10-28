import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminPageLayout } from '../shared/adminPage.js';
import { ManagerChecklistsPage } from './ManagerChecklistsPage.js';

function AnalyticsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')}
    currentPath="/admin/checklists/analytics" navItems={[
      { label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists' },
      { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' },
      { label: t('manager.checklists.title', 'Checklist analytics'), href: '/admin/checklists/analytics', isCurrent: true },
    ]}>{children}</AdminPageLayout>;
}

export function AdminChecklistAnalyticsPage() {
  return <ManagerChecklistsPage Layout={AnalyticsLayout} />;
}
