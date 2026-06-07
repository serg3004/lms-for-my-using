import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProtectedRoute } from './ProtectedRoute.js';
import { NotFoundPage } from './NotFoundPage.js';
import { Breadcrumbs, type BreadcrumbItem } from '../shared/ui.js';
import { getCurrentUser, type CurrentUser, type UserRole } from '../shared/apiClient.js';

// Lazy-loaded page chunks — each route loads its own JS chunk on first visit
const AdminAssessmentBuilderPage = lazy(() =>
  import('./AdminAssessmentBuilderPage.js').then((m) => ({ default: m.AdminAssessmentBuilderPage })),
);
const AdminAssignmentCompletionPage = lazy(() =>
  import('./AdminAssignmentCompletionPage.js').then((m) => ({ default: m.AdminAssignmentCompletionPage })),
);
const AdminCourseBuilderPage = lazy(() =>
  import('./AdminCourseBuilderPage.js').then((m) => ({ default: m.AdminCourseBuilderPage })),
);
const AdminDashboardPage = lazy(() =>
  import('./AdminDashboardPage.js').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminLessonsPage = lazy(() =>
  import('./AdminLessonsPage.js').then((m) => ({ default: m.AdminLessonsPage })),
);
const AdminMaterialsPage = lazy(() =>
  import('./AdminMaterialsPage.js').then((m) => ({ default: m.AdminMaterialsPage })),
);
const AdminOrgStructurePage = lazy(() =>
  import('./AdminOrgStructurePage.js').then((m) => ({ default: m.AdminOrgStructurePage })),
);
const AdminResultsCertificatesPage = lazy(() =>
  import('./AdminResultsCertificatesPage.js').then((m) => ({ default: m.AdminResultsCertificatesPage })),
);
const AdminRolesPage = lazy(() =>
  import('./AdminRolesPage.js').then((m) => ({ default: m.AdminRolesPage })),
);
const AdminThemeSettingsPage = lazy(() =>
  import('./AdminThemeSettingsPage.js').then((m) => ({ default: m.AdminThemeSettingsPage })),
);
const AdminUsersPage = lazy(() =>
  import('./AdminUsersPage.js').then((m) => ({ default: m.AdminUsersPage })),
);
const LearnerAssessmentDetailPage = lazy(() =>
  import('./LearnerAssessmentDetailPage.js').then((m) => ({ default: m.LearnerAssessmentDetailPage })),
);
const LearnerAssessmentTakingPage = lazy(() =>
  import('./LearnerAssessmentTakingPage.js').then((m) => ({ default: m.LearnerAssessmentTakingPage })),
);
const LearnerAssessmentsPage = lazy(() =>
  import('./LearnerAssessmentsPage.js').then((m) => ({ default: m.LearnerAssessmentsPage })),
);
const LearnerAssignmentDetailPage = lazy(() =>
  import('./LearnerAssignmentDetailPage.js').then((m) => ({ default: m.LearnerAssignmentDetailPage })),
);
const LearnerAssignmentsPage = lazy(() =>
  import('./LearnerAssignmentsPage.js').then((m) => ({ default: m.LearnerAssignmentsPage })),
);
const LearnerCertificateDetailPage = lazy(() =>
  import('./LearnerCertificateDetailPage.js').then((m) => ({ default: m.LearnerCertificateDetailPage })),
);
const LearnerCertificatesPage = lazy(() =>
  import('./LearnerCertificatesPage.js').then((m) => ({ default: m.LearnerCertificatesPage })),
);
const LearnerCourseDetailPage = lazy(() =>
  import('./LearnerCourseDetailPage.js').then((m) => ({ default: m.LearnerCourseDetailPage })),
);
const LearnerCoursesPage = lazy(() =>
  import('./LearnerCoursesPage.js').then((m) => ({ default: m.LearnerCoursesPage })),
);
const LearnerHomePage = lazy(() =>
  import('./LearnerHomePage.js').then((m) => ({ default: m.LearnerHomePage })),
);
const LearnerLessonDetailPage = lazy(() =>
  import('./LearnerLessonDetailPage.js').then((m) => ({ default: m.LearnerLessonDetailPage })),
);
const LearnerLessonMaterialsPage = lazy(() =>
  import('./LearnerLessonMaterialsPage.js').then((m) => ({ default: m.LearnerLessonMaterialsPage })),
);
const LearnerLessonsPage = lazy(() =>
  import('./LearnerLessonsPage.js').then((m) => ({ default: m.LearnerLessonsPage })),
);
const LearnerProgressPage = lazy(() =>
  import('./LearnerProgressPage.js').then((m) => ({ default: m.LearnerProgressPage })),
);
const LoginPage = lazy(() =>
  import('./LoginPage.js').then((m) => ({ default: m.LoginPage })),
);

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

// Shared context hooks for route components
function useAdminRoot() {
  const { t } = useTranslation();
  return { t, adminRoot: { label: t('admin.navLink', 'Admin'), href: '/admin' } };
}

function useLearnerRoot() {
  const { t } = useTranslation();
  return { t, learnerRoot: { label: t('learner.navLink'), href: '/learn' } };
}

// Admin route components
function AdminDashboardRoute() {
  const { adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminDashboardPage />, [{ ...adminRoot, href: undefined }]);
}

function AdminUsersRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminUsersPage />, [adminRoot, { label: t('users.title', 'Users') }]);
}

function AdminRolesRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminRolesPage />, [adminRoot, { label: t('roles.title', 'Roles') }]);
}

function AdminOrgStructureRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminOrgStructurePage />, [adminRoot, { label: t('organization.title', 'Organization') }]);
}

function AdminThemeSettingsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminThemeSettingsPage />, [adminRoot, { label: t('admin.themeSettings.title', 'Theme settings') }]);
}

function AdminCoursesRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminCourseBuilderPage />, [adminRoot, { label: t('courses.title') }]);
}

function AdminLessonsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminLessonsPage />, [adminRoot, { label: t('lessons.title', 'Lessons') }]);
}

function AdminMaterialsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminMaterialsPage />, [adminRoot, { label: t('materials.title', 'Materials') }]);
}

function AdminAssessmentsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminAssessmentBuilderPage />, [adminRoot, { label: t('assessments.title') }]);
}

function AdminAssignmentsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminAssignmentCompletionPage />, [adminRoot, { label: t('assignments.title') }]);
}

function AdminResultsRoute() {
  const { t, adminRoot } = useAdminRoot();
  return renderWithBreadcrumbs(<AdminResultsCertificatesPage />, [adminRoot, { label: t('results.title', 'Results') }]);
}

// Learner route components — static
function LearnerHomeRoute() {
  const { learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerHomePage />, [{ ...learnerRoot, href: undefined }]);
}

function LearnerCoursesRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerCoursesPage />, [learnerRoot, { label: t('courses.title') }]);
}

function LearnerProgressRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerProgressPage />, [learnerRoot, { label: t('progress.title') }]);
}

function LearnerAssignmentsRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerAssignmentsPage />, [learnerRoot, { label: t('assignments.title') }]);
}

function LearnerAssessmentsRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerAssessmentsPage />, [learnerRoot, { label: t('assessments.title') }]);
}

function LearnerCertificatesRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  return renderWithBreadcrumbs(<LearnerCertificatesPage />, [learnerRoot, { label: t('certificates.title') }]);
}

// Learner route components — dynamic (use useParams)
function LearnerCertificateDetailRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { certificateId } = useParams<{ certificateId: string }>();
  if (!certificateId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerCertificateDetailPage certificateId={certificateId} />,
    [learnerRoot, { label: t('certificates.title'), href: '/learn/certificates' }, { label: t('certificates.detailTitle', 'Certificate') }],
  );
}

function LearnerAssessmentTakingRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { assessmentId } = useParams<{ assessmentId: string }>();
  if (!assessmentId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerAssessmentTakingPage assessmentId={assessmentId} />,
    [learnerRoot, { label: t('assessments.title'), href: '/learn/assessments' }, { label: t('assessments.takeTitle', 'Taking') }],
  );
}

function LearnerAssessmentDetailRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { assessmentId } = useParams<{ assessmentId: string }>();
  if (!assessmentId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerAssessmentDetailPage assessmentId={assessmentId} />,
    [learnerRoot, { label: t('assessments.title'), href: '/learn/assessments' }, { label: t('assessments.detailTitle', 'Assessment') }],
  );
}

function LearnerAssignmentDetailRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  if (!assignmentId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerAssignmentDetailPage assignmentId={assignmentId} />,
    [learnerRoot, { label: t('assignments.title'), href: '/learn/assignments' }, { label: t('assignments.detailTitle', 'Assignment') }],
  );
}

function LearnerLessonMaterialsRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { lessonId } = useParams<{ lessonId: string }>();
  if (!lessonId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerLessonMaterialsPage lessonId={lessonId} />,
    [learnerRoot, { label: t('lessons.title', 'Lessons') }, { label: t('materials.title', 'Materials') }],
  );
}

function LearnerLessonDetailRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { lessonId } = useParams<{ lessonId: string }>();
  if (!lessonId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerLessonDetailPage lessonId={lessonId} />,
    [learnerRoot, { label: t('lessons.title', 'Lessons') }, { label: t('lessons.detailTitle', 'Lesson') }],
  );
}

function LearnerCourseLessonsRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerLessonsPage courseId={courseId} />,
    [learnerRoot, { label: t('courses.title'), href: '/learn/courses' }, { label: t('lessons.title', 'Lessons') }],
  );
}

function LearnerCourseDetailRoute() {
  const { t, learnerRoot } = useLearnerRoot();
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return <NotFoundPage />;
  return renderWithBreadcrumbs(
    <LearnerCourseDetailPage courseId={courseId} />,
    [learnerRoot, { label: t('courses.title'), href: '/learn/courses' }, { label: t('courses.detailTitle', 'Course') }],
  );
}

export function App() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <ProtectedRoute
      protectedPathPrefixes={['/learn', '/admin']}
      canAccess={(user) => !pathname.startsWith('/admin') || user.roles.some(isAdminNavigationRole)}
    >
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/admin" element={<AdminDashboardRoute />} />
          <Route path="/admin/users" element={<AdminUsersRoute />} />
          <Route path="/admin/roles" element={<AdminRolesRoute />} />
          <Route path="/admin/org-structure" element={<AdminOrgStructureRoute />} />
          <Route path="/admin/theme-settings" element={<AdminThemeSettingsRoute />} />
          <Route path="/admin/courses" element={<AdminCoursesRoute />} />
          <Route path="/admin/lessons" element={<AdminLessonsRoute />} />
          <Route path="/admin/materials" element={<AdminMaterialsRoute />} />
          <Route path="/admin/assessments" element={<AdminAssessmentsRoute />} />
          <Route path="/admin/assignments" element={<AdminAssignmentsRoute />} />
          <Route path="/admin/results" element={<AdminResultsRoute />} />

          <Route path="/learn" element={<LearnerHomeRoute />} />
          <Route path="/learn/courses" element={<LearnerCoursesRoute />} />
          <Route path="/learn/progress" element={<LearnerProgressRoute />} />
          <Route path="/learn/assignments" element={<LearnerAssignmentsRoute />} />
          <Route path="/learn/assessments" element={<LearnerAssessmentsRoute />} />
          <Route path="/learn/certificates" element={<LearnerCertificatesRoute />} />

          <Route path="/learn/certificates/:certificateId" element={<LearnerCertificateDetailRoute />} />
          <Route path="/learn/assessments/:assessmentId/take" element={<LearnerAssessmentTakingRoute />} />
          <Route path="/learn/assessments/:assessmentId" element={<LearnerAssessmentDetailRoute />} />
          <Route path="/learn/assignments/:assignmentId" element={<LearnerAssignmentDetailRoute />} />
          <Route path="/learn/lessons/:lessonId/materials" element={<LearnerLessonMaterialsRoute />} />
          <Route path="/learn/lessons/:lessonId" element={<LearnerLessonDetailRoute />} />
          <Route path="/learn/courses/:courseId/lessons" element={<LearnerCourseLessonsRoute />} />
          <Route path="/learn/courses/:courseId" element={<LearnerCourseDetailRoute />} />

          <Route
            path="/"
            element={
              <main>
                <h1>{t('app.title')}</h1>
                <p>{t('app.subtitle')}</p>
                <RootNavigation />
              </main>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ProtectedRoute>
  );
}
