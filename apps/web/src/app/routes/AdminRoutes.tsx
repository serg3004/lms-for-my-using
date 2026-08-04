import { lazy } from 'react';
import { Route } from 'react-router-dom';

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

export function AdminRoutes() {
  return <>
    <Route path="/admin" element={<AdminDashboardPage />} />
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="/admin/roles" element={<AdminRolesPage />} />
    <Route path="/admin/org-structure" element={<AdminOrgStructurePage />} />
    <Route path="/admin/theme-settings" element={<AdminThemeSettingsPage />} />
    <Route path="/admin/courses" element={<AdminCoursesPage />} />
    <Route path="/admin/courses/:courseId" element={<AdminCourseBuilderPage />} />
    <Route path="/admin/lessons" element={<AdminLessonsPage />} />
    <Route path="/admin/materials" element={<AdminMaterialsPage />} />
    <Route path="/admin/assessments" element={<AdminAssessmentBuilderPage />} />
    <Route path="/admin/assignments" element={<AdminAssignmentCompletionPage />} />
    <Route path="/admin/results" element={<AdminResultsCertificatesPage />} />
  </>;
}
