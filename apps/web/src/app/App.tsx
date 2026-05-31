import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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

function renderWithBreadcrumbs(page: ReactNode, items: BreadcrumbItem[]) {
  return (
    <>
      <Breadcrumbs items={items} />
      {page}
    </>
  );
}

type DetailRouteProps = {
  items: BreadcrumbItem[];
};

function LearnerCertificateDetailRoute({ items }: DetailRouteProps) {
  const { certificateId } = useParams();

  if (!certificateId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerCertificateDetailPage certificateId={certificateId} />, items);
}

function LearnerAssessmentTakingRoute({ items }: DetailRouteProps) {
  const { assessmentId } = useParams();

  if (!assessmentId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerAssessmentTakingPage assessmentId={assessmentId} />, items);
}

function LearnerAssessmentDetailRoute({ items }: DetailRouteProps) {
  const { assessmentId } = useParams();

  if (!assessmentId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerAssessmentDetailPage assessmentId={assessmentId} />, items);
}

function LearnerAssignmentDetailRoute({ items }: DetailRouteProps) {
  const { assignmentId } = useParams();

  if (!assignmentId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerAssignmentDetailPage assignmentId={assignmentId} />, items);
}

function LearnerLessonMaterialsRoute({ items }: DetailRouteProps) {
  const { lessonId } = useParams();

  if (!lessonId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerLessonMaterialsPage lessonId={lessonId} />, items);
}

function LearnerLessonDetailRoute({ items }: DetailRouteProps) {
  const { lessonId } = useParams();

  if (!lessonId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerLessonDetailPage lessonId={lessonId} />, items);
}

function LearnerCourseLessonsRoute({ items }: DetailRouteProps) {
  const { courseId } = useParams();

  if (!courseId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerLessonsPage courseId={courseId} />, items);
}

function LearnerCourseDetailRoute({ items }: DetailRouteProps) {
  const { courseId } = useParams();

  if (!courseId) {
    return <NotFoundPage />;
  }

  return renderWithBreadcrumbs(<LearnerCourseDetailPage courseId={courseId} />, items);
}

function HomePage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <nav>
        <Link to="/login">{t('login.navLink')}</Link>
        <Link to="/admin">{t('admin.navLink', 'Admin')}</Link>
        <Link to="/learn">{t('learner.navLink')}</Link>
        <Link to="/learn/courses">{t('courses.navLink')}</Link>
        <Link to="/learn/progress">{t('progress.navLink')}</Link>
        <Link to="/learn/assignments">{t('assignments.navLink')}</Link>
        <Link to="/learn/assessments">{t('assessments.navLink')}</Link>
        <Link to="/learn/certificates">{t('certificates.navLink')}</Link>
      </nav>
    </main>
  );
}

export function App() {
  const { t } = useTranslation();
  const learnerRoot = { label: t('learner.navLink'), href: '/learn' };
  const adminRoot = { label: t('admin.navLink', 'Admin'), href: '/admin' };
  const learnerRootOnly = [{ ...learnerRoot, href: undefined }];
  const adminRootOnly = [{ ...adminRoot, href: undefined }];

  const appRoutes = [
    { path: '/', element: <HomePage /> },
    { path: '/login', element: <LoginPage /> },
    { path: '/admin', element: renderWithBreadcrumbs(<AdminDashboardPage />, adminRootOnly) },
    {
      path: '/admin/users',
      element: renderWithBreadcrumbs(<AdminUsersPage />, [adminRoot, { label: t('users.title', 'Users') }]),
    },
    {
      path: '/admin/roles',
      element: renderWithBreadcrumbs(<AdminRolesPage />, [adminRoot, { label: t('roles.title', 'Roles') }]),
    },
    {
      path: '/admin/org-structure',
      element: renderWithBreadcrumbs(<AdminOrgStructurePage />, [
        adminRoot,
        { label: t('organization.title', 'Organization') },
      ]),
    },
    {
      path: '/admin/theme-settings',
      element: renderWithBreadcrumbs(<AdminThemeSettingsPage />, [
        adminRoot,
        { label: t('admin.themeSettings.title', 'Theme settings') },
      ]),
    },
    {
      path: '/admin/courses',
      element: renderWithBreadcrumbs(<AdminCourseBuilderPage />, [adminRoot, { label: t('courses.title') }]),
    },
    {
      path: '/admin/lessons',
      element: renderWithBreadcrumbs(<AdminLessonsPage />, [
        adminRoot,
        { label: t('lessons.title', 'Lessons') },
      ]),
    },
    {
      path: '/admin/materials',
      element: renderWithBreadcrumbs(<AdminMaterialsPage />, [
        adminRoot,
        { label: t('materials.title', 'Materials') },
      ]),
    },
    {
      path: '/admin/assessments',
      element: renderWithBreadcrumbs(<AdminAssessmentBuilderPage />, [adminRoot, { label: t('assessments.title') }]),
    },
    {
      path: '/admin/assignments',
      element: renderWithBreadcrumbs(<AdminAssignmentCompletionPage />, [adminRoot, { label: t('assignments.title') }]),
    },
    {
      path: '/admin/results',
      element: renderWithBreadcrumbs(<AdminResultsCertificatesPage />, [
        adminRoot,
        { label: t('results.title', 'Results') },
      ]),
    },
    { path: '/learn', element: renderWithBreadcrumbs(<LearnerHomePage />, learnerRootOnly) },
    {
      path: '/learn/courses',
      element: renderWithBreadcrumbs(<LearnerCoursesPage />, [learnerRoot, { label: t('courses.title') }]),
    },
    {
      path: '/learn/progress',
      element: renderWithBreadcrumbs(<LearnerProgressPage />, [learnerRoot, { label: t('progress.title') }]),
    },
    {
      path: '/learn/assignments',
      element: renderWithBreadcrumbs(<LearnerAssignmentsPage />, [learnerRoot, { label: t('assignments.title') }]),
    },
    {
      path: '/learn/assessments',
      element: renderWithBreadcrumbs(<LearnerAssessmentsPage />, [learnerRoot, { label: t('assessments.title') }]),
    },
    {
      path: '/learn/certificates',
      element: renderWithBreadcrumbs(<LearnerCertificatesPage />, [learnerRoot, { label: t('certificates.title') }]),
    },
    {
      path: '/learn/certificates/:certificateId',
      element: (
        <LearnerCertificateDetailRoute
          items={[
            learnerRoot,
            { label: t('certificates.title'), href: '/learn/certificates' },
            { label: t('certificates.detailTitle', 'Certificate') },
          ]}
        />
      ),
    },
    {
      path: '/learn/assessments/:assessmentId/take',
      element: (
        <LearnerAssessmentTakingRoute
          items={[
            learnerRoot,
            { label: t('assessments.title'), href: '/learn/assessments' },
            { label: t('assessments.takeTitle', 'Taking') },
          ]}
        />
      ),
    },
    {
      path: '/learn/assessments/:assessmentId',
      element: (
        <LearnerAssessmentDetailRoute
          items={[
            learnerRoot,
            { label: t('assessments.title'), href: '/learn/assessments' },
            { label: t('assessments.detailTitle', 'Assessment') },
          ]}
        />
      ),
    },
    {
      path: '/learn/assignments/:assignmentId',
      element: (
        <LearnerAssignmentDetailRoute
          items={[
            learnerRoot,
            { label: t('assignments.title'), href: '/learn/assignments' },
            { label: t('assignments.detailTitle', 'Assignment') },
          ]}
        />
      ),
    },
    {
      path: '/learn/lessons/:lessonId/materials',
      element: (
        <LearnerLessonMaterialsRoute
          items={[
            learnerRoot,
            { label: t('lessons.title', 'Lessons') },
            { label: t('materials.title', 'Materials') },
          ]}
        />
      ),
    },
    {
      path: '/learn/lessons/:lessonId',
      element: (
        <LearnerLessonDetailRoute
          items={[
            learnerRoot,
            { label: t('lessons.title', 'Lessons') },
            { label: t('lessons.detailTitle', 'Lesson') },
          ]}
        />
      ),
    },
    {
      path: '/learn/courses/:courseId/lessons',
      element: (
        <LearnerCourseLessonsRoute
          items={[
            learnerRoot,
            { label: t('courses.title'), href: '/learn/courses' },
            { label: t('lessons.title', 'Lessons') },
          ]}
        />
      ),
    },
    {
      path: '/learn/courses/:courseId',
      element: (
        <LearnerCourseDetailRoute
          items={[
            learnerRoot,
            { label: t('courses.title'), href: '/learn/courses' },
            { label: t('courses.detailTitle', 'Course') },
          ]}
        />
      ),
    },
    { path: '/learn/', element: <Navigate to="/learn" replace /> },
    { path: '*', element: <NotFoundPage /> },
  ];

  return (
    <Routes>
      {appRoutes.map((route) => (
        <Route element={route.element} key={route.path} path={route.path} />
      ))}
    </Routes>
  );
}
