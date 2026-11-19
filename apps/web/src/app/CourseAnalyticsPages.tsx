import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminPageLayout } from '../shared/adminPage.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { CourseAnalyticsRoutes } from './CourseAnalyticsPage.js';

export const ADMIN_COURSE_ANALYTICS_PATH = '/admin/results/courses';
export const MANAGER_COURSE_ANALYTICS_PATH = '/manager/reports/courses';
export const INSTRUCTOR_COURSE_ANALYTICS_PATH = '/instructor/courses/analytics';

function AdminLayout({ children }: { children: ReactNode; currentPath?: string }) {
  const { t } = useTranslation();
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={[
    { label: t('admin.results.title', 'Results'), href: '/admin/results' },
    { label: t('courseAnalytics.title'), href: ADMIN_COURSE_ANALYTICS_PATH, isCurrent: true },
  ]}>{children}</AdminPageLayout>;
}

function ManagerLayout({ children }: { children: ReactNode; currentPath?: string }) {
  return <ManagerPageLayout currentPath="/manager/reports">{children}</ManagerPageLayout>;
}

function InstructorLayout({ children }: { children: ReactNode; currentPath?: string }) {
  return <InstructorPageLayout>{children}</InstructorPageLayout>;
}

export function AdminCourseAnalyticsPage() {
  return <CourseAnalyticsRoutes Layout={AdminLayout} basePath={ADMIN_COURSE_ANALYTICS_PATH} />;
}
export function ManagerCourseAnalyticsPage() {
  return <CourseAnalyticsRoutes Layout={ManagerLayout} basePath={MANAGER_COURSE_ANALYTICS_PATH} />;
}
export function InstructorCourseAnalyticsPage() {
  return <CourseAnalyticsRoutes Layout={InstructorLayout} basePath={INSTRUCTOR_COURSE_ANALYTICS_PATH} />;
}
