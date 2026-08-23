import type { CurrentUser } from './apiClient.js';

export type RootNavigationItem = {
  labelKey: string;
  fallbackLabel?: string;
  href: string;
};

const learnerNavigationItems: RootNavigationItem[] = [
  { labelKey: 'learner.navLink', href: '/learn' },
  { labelKey: 'courses.navLink', href: '/learn/courses' },
  { labelKey: 'progress.navLink', href: '/learn/progress' },
  { labelKey: 'assignments.navLink', href: '/learn/assignments' },
  { labelKey: 'assessments.navLink', href: '/learn/assessments' },
  { labelKey: 'certificates.navLink', href: '/learn/certificates' },
];

const adminNavigationItem: RootNavigationItem = {
  labelKey: 'admin.navLink',
  fallbackLabel: 'Admin',
  href: '/admin',
};

const managerNavigationItem: RootNavigationItem = {
  labelKey: 'manager.navLink',
  fallbackLabel: 'Manager',
  href: '/manager',
};

const instructorNavigationItem: RootNavigationItem = {
  labelKey: 'instructor.navLink',
  fallbackLabel: 'Instructor',
  href: '/instructor',
};

const mentorNavigationItem: RootNavigationItem = {
  labelKey: 'mentor.navLink',
  fallbackLabel: 'Mentor',
  href: '/mentor',
};

export function getRootNavigationItems(user: Pick<CurrentUser, 'roles'> | null): RootNavigationItem[] {
  if (!user) {
    return [{ labelKey: 'login.navLink', href: '/login' }];
  }

  if (user.roles.includes('admin')) {
    return [adminNavigationItem, ...learnerNavigationItems];
  }
  if (user.roles.includes('instructor')) {
    return [instructorNavigationItem, ...learnerNavigationItems];
  }
  if (user.roles.includes('manager')) {
    return [managerNavigationItem, ...learnerNavigationItems];
  }
  if (user.roles.includes('mentor')) {
    return [mentorNavigationItem, ...learnerNavigationItems];
  }
  return learnerNavigationItems;
}
