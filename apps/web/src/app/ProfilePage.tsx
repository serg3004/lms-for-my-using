import { useTranslation } from 'react-i18next';

import { AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { LearnerPageLayout } from '../shared/learnerLayout.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { MentorPageLayout } from '../shared/mentorLayout.js';
import { useSession } from '../shared/session.js';
import { LearnerProfilePage } from './LearnerProfilePage.js';

/**
 * PR 496: one "Profile" screen at `/profile` for every signed-in person, whatever the role. The content is the same;
 * only the frame around it (menu, header) is the one of the person's main role.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  if (!currentUser) return <LearnerProfilePage />;

  const content = <LearnerProfilePage />;
  const roles = currentUser.roles;
  if (roles.includes('admin')) {
    const navItems: AdminNavItem[] = [
      { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
      { label: t('learner.profileTitle'), href: '/profile', isCurrent: true },
    ];
    return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>{content}</AdminPageLayout>;
  }
  if (roles.includes('manager')) return <ManagerPageLayout>{content}</ManagerPageLayout>;
  if (roles.includes('instructor')) return <InstructorPageLayout firstName={currentUser.firstName} lastName={currentUser.lastName}>{content}</InstructorPageLayout>;
  if (roles.includes('mentor')) return <MentorPageLayout firstName={currentUser.firstName} lastName={currentUser.lastName}>{content}</MentorPageLayout>;
  return <LearnerPageLayout>{content}</LearnerPageLayout>;
}
