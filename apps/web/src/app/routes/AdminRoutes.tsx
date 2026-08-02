import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { renderWithBreadcrumbs } from './routeUtils.js';

const AdminAssessmentBuilderPage = lazy(() => import('../AdminAssessmentBuilderPage.js').then((m) => ({ default: m.AdminAssessmentBuilderPage })));
const AdminAssignmentCompletionPage = lazy(() => import('../AdminAssignmentCompletionPage.js').then((m) => ({ default: m.AdminAssignmentCompletionPage })));
const AdminCourseBuilderPage = lazy(() => import('../AdminCourseBuilderPage.js').then((m) => ({ default: m.AdminCourseBuilderPage })));
const AdminCoursesPage = lazy(() => import('../AdminCoursesPage.js').then((m) => ({ default: m.AdminCoursesPage })));
const AdminDashboardPage = lazy(() => import('../AdminDashboardPage.js').then((m) => ({ default: m.AdminDashboardPage })));
const AdminLessonsPage = lazy(() => import('../AdminLessonsPage.js').then((m) => ({ default: m.AdminLessonsPage })));
const AdminMaterialsPage = lazy(() => import('../AdminMaterialsPage.js').then((m) => ({ default: m.AdminMaterialsPage })));
const AdminOrgStructurePage = lazy(() => import('../AdminOrgStructurePage.js').then((m) => ({ default: m.AdminOrgStructurePage })));
const AdminResultsCertificatesPage = lazy(() => import('../AdminResultsCertificatesPage.js').then((m) => ({ default: m.AdminResultsCertificatesPage })));
const AdminRolesPage = lazy(() => import('../AdminRolesPage.js').then((m) => ({ default: m.AdminRolesPage })));
const AdminThemeSettingsPage = lazy(() => import('../AdminThemeSettingsPage.js').then((m) => ({ default: m.AdminThemeSettingsPage })));
const AdminUsersPage = lazy(() => import('../AdminUsersPage.js').then((m) => ({ default: m.AdminUsersPage })));

function useAdminRoot() {
  const { t } = useTranslation();
  return { t, adminRoot: { label: t('admin.navLink', 'Admin'), href: '/admin' } };
}

function DashboardRoute() { const { adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminDashboardPage />, [{ ...adminRoot, href: undefined }]); }
function UsersRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminUsersPage />, [adminRoot, { label: t('users.title', 'Users') }]); }
function RolesRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminRolesPage />, [adminRoot, { label: t('roles.title', 'Roles') }]); }
function OrgStructureRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminOrgStructurePage />, [adminRoot, { label: t('organization.title', 'Organization') }]); }
function ThemeSettingsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminThemeSettingsPage />, [adminRoot, { label: t('admin.themeSettings.title', 'Theme settings') }]); }
function CoursesRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminCoursesPage />, [adminRoot, { label: t('courses.title') }]); }
function CourseBuilderRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminCourseBuilderPage />, [adminRoot, { label: t('courses.title'), href: '/admin/courses' }, { label: t('admin.courses.builder', 'Builder') }]); }
function LessonsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminLessonsPage />, [adminRoot, { label: t('lessons.title', 'Lessons') }]); }
function MaterialsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminMaterialsPage />, [adminRoot, { label: t('materials.title', 'Materials') }]); }
function AssessmentsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminAssessmentBuilderPage />, [adminRoot, { label: t('assessments.title') }]); }
function AssignmentsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminAssignmentCompletionPage />, [adminRoot, { label: t('assignments.title') }]); }
function ResultsRoute() { const { t, adminRoot } = useAdminRoot(); return renderWithBreadcrumbs(<AdminResultsCertificatesPage />, [adminRoot, { label: t('results.title', 'Results') }]); }

export function AdminRoutes() {
  return <>
    <Route path="/admin" element={<DashboardRoute />} />
    <Route path="/admin/users" element={<UsersRoute />} />
    <Route path="/admin/roles" element={<RolesRoute />} />
    <Route path="/admin/org-structure" element={<OrgStructureRoute />} />
    <Route path="/admin/theme-settings" element={<ThemeSettingsRoute />} />
    <Route path="/admin/courses" element={<CoursesRoute />} />
    <Route path="/admin/courses/:courseId" element={<CourseBuilderRoute />} />
    <Route path="/admin/lessons" element={<LessonsRoute />} />
    <Route path="/admin/materials" element={<MaterialsRoute />} />
    <Route path="/admin/assessments" element={<AssessmentsRoute />} />
    <Route path="/admin/assignments" element={<AssignmentsRoute />} />
    <Route path="/admin/results" element={<ResultsRoute />} />
  </>;
}
