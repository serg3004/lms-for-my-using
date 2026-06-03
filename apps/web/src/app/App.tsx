import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ProtectedRoute } from './ProtectedRoute.js';

import { AdminAssessmentBuilderPage } from './AdminAssessmentBuilderPage.js';
import { AdminAssignmentCompletionPage } from './AdminAssignmentCompletionPage.js';
import { AdminCourseBuilderPage } from './AdminCourseBuilderPage.js';
import { AdminDashboardPage } from './AdminDashboardPage.js';
import { AdminLessonsPage } from './AdminLessonsPage.js';
import { AdminMaterialsPage } from './AdminMaterialsPage.js';
import { AdminOrgStructurePage } from './AdminOrgStructurePage.js';
import { AdminResultsCertificatesPage } from './AdminResultsCertificatesPage.js';
import { AdminRolesPage } from './AdminRolesPage.js';
import { AdminThemeSettingsPage } from './AdminThemeSettingsPage.js';
import { AdminUsersPage } from './AdminUsersPage.js';
import { LearnerAssessmentDetailPage } from './LearnerAssessmentDetailPage.js';
import { LearnerAssessmentTakingPage } from './LearnerAssessmentTakingPage.js';
import { LearnerAssessmentsPage } from './LearnerAssessmentsPage.js';
import { LearnerAssignmentDetailPage } from './LearnerAssignmentDetailPage.js';
import { LearnerAssignmentsPage } from './LearnerAssignmentsPage.js';
import { LearnerCertificateDetailPage } from './LearnerCertificateDetailPage.js';
import { LearnerCertificatesPage } from './LearnerCertificatesPage.js';
import { LearnerCourseDetailPage } from './LearnerCourseDetailPage.js';
import { LearnerCoursesPage } from './LearnerCoursesPage.js';
import { LearnerHomePage } from './LearnerHomePage.js';
import { LearnerLessonDetailPage } from './LearnerLessonDetailPage.js';
import { LearnerLessonMaterialsPage } from './LearnerLessonMaterialsPage.js';
import { LearnerLessonsPage } from './LearnerLessonsPage.js';
import { LearnerProgressPage } from './LearnerProgressPage.js';
import { LoginPage } from './LoginPage.js';
import { NotFoundPage } from './NotFoundPage.js';
import { Breadcrumbs, type BreadcrumbItem } from '../shared/ui.js';
import { getCurrentUser, type CurrentUser, type UserRole } from '../shared/apiClient.js';

const assessmentDetailPathPrefix = '/learn/assessments/';
const assessmentTakingPathSuffix = '/take';
const assignmentDetailPathPrefix = '/learn/assignments/';
const certificateDetailPathPrefix = '/learn/certificates/';
const courseDetailPathPrefix = '/learn/courses/';
const lessonsPathSuffix = '/lessons';
const lessonDetailPathPrefix = '/learn/lessons/';
const lessonMaterialsPathSuffix = '/materials';

type RootNavigationItem = {
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

function isAdminNavigationRole(role: UserRole) {
  return role === 'admin' || role === 'manager' || role === 'instructor';
}

export function getRootNavigationItems(user: Pick<CurrentUser, 'roles'> | null): RootNavigationItem[] {
  if (!user) {
    return [{ labelKey: 'login.navLink', href: '/login' }];
  }

  return user.roles.some(isAdminNavigationRole) ? [adminNavigationItem, ...learnerNavigationItems] : learnerNavigationItems;
}

function renderWithBreadcrumbs(page: ReactNode, items: BreadcrumbItem[]) {
  return (
    <>
      <Breadcrumbs items={items} />
      {page}
    </>
  );
}

function RootNavigation() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<Pick<CurrentUser, 'roles'> | null>(null);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const user = await getCurrentUser();

        if (isMounted) {
          setCurrentUser({ roles: user.roles });
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setHasCheckedAuth(true);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!hasCheckedAuth) {
    return null;
  }

  return (
    <nav>
      {getRootNavigationItems(currentUser).map((item) => (
        <Link key={item.href} to={item.href}>
          {item.fallbackLabel ? t(item.labelKey, item.fallbackLabel) : t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}

type BreadcrumbRoot = { label: string; href: string };

function resolveAppPage(
  pathname: string,
  t: TFunction,
  learnerRoot: BreadcrumbRoot,
  adminRoot: BreadcrumbRoot,
): ReactNode {
  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/admin') {
    return renderWithBreadcrumbs(<AdminDashboardPage />, [{ ...adminRoot, href: undefined }]);
  }

  if (pathname === '/admin/users') {
    return renderWithBreadcrumbs(<AdminUsersPage />, [adminRoot, { label: t('users.title', 'Users') }]);
  }

  if (pathname === '/admin/roles') {
    return renderWithBreadcrumbs(<AdminRolesPage />, [adminRoot, { label: t('roles.title', 'Roles') }]);
  }

  if (pathname === '/admin/org-structure') {
    return renderWithBreadcrumbs(<AdminOrgStructurePage />, [adminRoot, { label: t('organization.title', 'Organization') }]);
  }

  if (pathname === '/admin/theme-settings') {
    return renderWithBreadcrumbs(<AdminThemeSettingsPage />, [
      adminRoot,
      { label: t('admin.themeSettings.title', 'Theme settings') },
    ]);
  }

  if (pathname === '/admin/courses') {
    return renderWithBreadcrumbs(<AdminCourseBuilderPage />, [adminRoot, { label: t('courses.title') }]);
  }

  if (pathname === '/admin/lessons') {
    return renderWithBreadcrumbs(<AdminLessonsPage />, [adminRoot, { label: t('lessons.title', 'Lessons') }]);
  }

  if (pathname === '/admin/materials') {
    return renderWithBreadcrumbs(<AdminMaterialsPage />, [adminRoot, { label: t('materials.title', 'Materials') }]);
  }

  if (pathname === '/admin/assessments') {
    return renderWithBreadcrumbs(<AdminAssessmentBuilderPage />, [adminRoot, { label: t('assessments.title') }]);
  }

  if (pathname === '/admin/assignments') {
    return renderWithBreadcrumbs(<AdminAssignmentCompletionPage />, [adminRoot, { label: t('assignments.title') }]);
  }

  if (pathname === '/admin/results') {
    return renderWithBreadcrumbs(<AdminResultsCertificatesPage />, [adminRoot, { label: t('results.title', 'Results') }]);
  }

  if (pathname === '/learn') {
    return renderWithBreadcrumbs(<LearnerHomePage />, [{ ...learnerRoot, href: undefined }]);
  }

  if (pathname === '/learn/courses') {
    return renderWithBreadcrumbs(<LearnerCoursesPage />, [learnerRoot, { label: t('courses.title') }]);
  }

  if (pathname === '/learn/progress') {
    return renderWithBreadcrumbs(<LearnerProgressPage />, [learnerRoot, { label: t('progress.title') }]);
  }

  if (pathname === '/learn/assignments') {
    return renderWithBreadcrumbs(<LearnerAssignmentsPage />, [learnerRoot, { label: t('assignments.title') }]);
  }

  if (pathname === '/learn/assessments') {
    return renderWithBreadcrumbs(<LearnerAssessmentsPage />, [learnerRoot, { label: t('assessments.title') }]);
  }

  if (pathname === '/learn/certificates') {
    return renderWithBreadcrumbs(<LearnerCertificatesPage />, [learnerRoot, { label: t('certificates.title') }]);
  }

  if (pathname.startsWith(certificateDetailPathPrefix)) {
    const certificateId = pathname.slice(certificateDetailPathPrefix.length);

    if (certificateId) {
      return renderWithBreadcrumbs(
        <LearnerCertificateDetailPage certificateId={certificateId} />,
        [learnerRoot, { label: t('certificates.title'), href: '/learn/certificates' }, { label: t('certificates.detailTitle', 'Certificate') }],
      );
    }
  }

  if (pathname.startsWith(assessmentDetailPathPrefix) && pathname.endsWith(assessmentTakingPathSuffix)) {
    const assessmentId = pathname.slice(
      assessmentDetailPathPrefix.length,
      -assessmentTakingPathSuffix.length,
    );

    if (assessmentId) {
      return renderWithBreadcrumbs(
        <LearnerAssessmentTakingPage assessmentId={assessmentId} />,
        [learnerRoot, { label: t('assessments.title'), href: '/learn/assessments' }, { label: t('assessments.takeTitle', 'Taking') }],
      );
    }
  }

  if (pathname.startsWith(assessmentDetailPathPrefix)) {
    const assessmentId = pathname.slice(assessmentDetailPathPrefix.length);

    if (assessmentId) {
      return renderWithBreadcrumbs(
        <LearnerAssessmentDetailPage assessmentId={assessmentId} />,
        [learnerRoot, { label: t('assessments.title'), href: '/learn/assessments' }, { label: t('assessments.detailTitle', 'Assessment') }],
      );
    }
  }

  if (pathname.startsWith(assignmentDetailPathPrefix)) {
    const assignmentId = pathname.slice(assignmentDetailPathPrefix.length);

    if (assignmentId) {
      return renderWithBreadcrumbs(
        <LearnerAssignmentDetailPage assignmentId={assignmentId} />,
        [learnerRoot, { label: t('assignments.title'), href: '/learn/assignments' }, { label: t('assignments.detailTitle', 'Assignment') }],
      );
    }
  }

  if (pathname.startsWith(lessonDetailPathPrefix) && pathname.endsWith(lessonMaterialsPathSuffix)) {
    const lessonId = pathname.slice(
      lessonDetailPathPrefix.length,
      -lessonMaterialsPathSuffix.length,
    );

    if (lessonId) {
      return renderWithBreadcrumbs(
        <LearnerLessonMaterialsPage lessonId={lessonId} />,
        [learnerRoot, { label: t('lessons.title', 'Lessons') }, { label: t('materials.title', 'Materials') }],
      );
    }
  }

  if (pathname.startsWith(lessonDetailPathPrefix)) {
    const lessonId = pathname.slice(lessonDetailPathPrefix.length);

    if (lessonId) {
      return renderWithBreadcrumbs(
        <LearnerLessonDetailPage lessonId={lessonId} />,
        [learnerRoot, { label: t('lessons.title', 'Lessons') }, { label: t('lessons.detailTitle', 'Lesson') }],
      );
    }
  }

  if (pathname.startsWith(courseDetailPathPrefix) && pathname.endsWith(lessonsPathSuffix)) {
    const courseId = pathname.slice(courseDetailPathPrefix.length, -lessonsPathSuffix.length);

    if (courseId) {
      return renderWithBreadcrumbs(
        <LearnerLessonsPage courseId={courseId} />,
        [learnerRoot, { label: t('courses.title'), href: '/learn/courses' }, { label: t('lessons.title', 'Lessons') }],
      );
    }
  }

  if (pathname.startsWith(courseDetailPathPrefix)) {
    const courseId = pathname.slice(courseDetailPathPrefix.length);

    if (courseId) {
      return renderWithBreadcrumbs(
        <LearnerCourseDetailPage courseId={courseId} />,
        [learnerRoot, { label: t('courses.title'), href: '/learn/courses' }, { label: t('courses.detailTitle', 'Course') }],
      );
    }
  }

  if (pathname !== '/') {
    return <NotFoundPage />;
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <RootNavigation />
    </main>
  );
}

export function App() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const learnerRoot = { label: t('learner.navLink'), href: '/learn' };
  const adminRoot = { label: t('admin.navLink', 'Admin'), href: '/admin' };

  return (
    <ProtectedRoute
      protectedPathPrefixes={['/learn', '/admin']}
      canAccess={(user) => !pathname.startsWith('/admin') || user.roles.some(isAdminNavigationRole)}
    >
      {resolveAppPage(pathname, t, learnerRoot, adminRoot)}
    </ProtectedRoute>
  );
}
