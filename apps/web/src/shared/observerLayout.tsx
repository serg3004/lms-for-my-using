import { useTranslation } from 'react-i18next';
import { AdminPageLayout } from './adminPage.js';
import type { ReactNode } from 'react';
import { useOptionalSession } from './session.js';
import { InstructorPageLayout } from './instructorLayout.js';
import { LearnerPageLayout } from './learnerLayout.js';
import { ManagerPageLayout } from './managerLayout.js';
import { MentorPageLayout } from './mentorLayout.js';

export function ObserverPageLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const roles = useOptionalSession()?.currentUser?.roles ?? [];
  if (roles.includes('instructor')) return <InstructorPageLayout>{children}</InstructorPageLayout>;
  if (roles.includes('admin')) return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={[{ label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists' }, { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' }]}>{children}</AdminPageLayout>;
  if (roles.includes('manager')) return <ManagerPageLayout>{children}</ManagerPageLayout>;
  if (roles.includes('mentor')) return <MentorPageLayout>{children}</MentorPageLayout>;
  return <LearnerPageLayout>{children}</LearnerPageLayout>;
}
