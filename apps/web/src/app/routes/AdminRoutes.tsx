import { lazy } from 'react';
import { Route } from 'react-router-dom';

const AdminAssessmentBuilderPage = lazy(() => import('../AdminAssessmentBuilderPage.js').then((m) => ({ default: m.AdminAssessmentBuilderPage })));
const AdminAssignmentCompletionPage = lazy(() => import('../AdminAssignmentCompletionPage.js').then((m) => ({ default: m.AdminAssignmentCompletionPage })));
const AdminAuditLogPage = lazy(() => import('../AdminAuditLogPage.js').then((m) => ({ default: m.AdminAuditLogPage })));
const AdminChecklistsPage = lazy(() => import('../AdminChecklistsPage.js').then((m) => ({ default: m.AdminChecklistsPage })));
const AdminCourseBuilderPage = lazy(() => import('../AdminCourseBuilderPage.js').then((m) => ({ default: m.AdminCourseBuilderPage })));
const AdminCoursesPage = lazy(() => import('../AdminCoursesPage.js').then((m) => ({ default: m.AdminCoursesPage })));
const AdminDashboardPage = lazy(() => import('../AdminDashboardPage.js').then((m) => ({ default: m.AdminDashboardPage })));
const AdminGroupsPage = lazy(() => import('../AdminGroupsPage.js').then((m) => ({ default: m.AdminGroupsPage })));
const AdminLessonsPage = lazy(() => import('../AdminLessonsPage.js').then((m) => ({ default: m.AdminLessonsPage })));
const AdminMaterialsPage = lazy(() => import('../AdminMaterialsPage.js').then((m) => ({ default: m.AdminMaterialsPage })));
const AdminResultsCertificatesPage = lazy(() => import('../AdminResultsCertificatesPage.js').then((m) => ({ default: m.AdminResultsCertificatesPage })));
const AdminRolesPage = lazy(() => import('../AdminRolesPage.js').then((m) => ({ default: m.AdminRolesPage })));
const AdminThemeSettingsPage = lazy(() => import('../AdminThemeSettingsPage.js').then((m) => ({ default: m.AdminThemeSettingsPage })));
const AdminUsersPage = lazy(() => import('../AdminUsersPage.js').then((m) => ({ default: m.AdminUsersPage })));

export function AdminRoutes() {
  return <>
    <Route path="/admin" element={<AdminDashboardPage />} />
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="/admin/roles" element={<AdminRolesPage />} />
    <Route path="/admin/groups" element={<AdminGroupsPage />} />
    <Route path="/admin/appearance" element={<AdminThemeSettingsPage />} />
    <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
    <Route path="/admin/courses" element={<AdminCoursesPage />} />
    <Route path="/admin/courses/:courseId" element={<AdminCourseBuilderPage />} />
    <Route path="/admin/lessons" element={<AdminLessonsPage />} />
    <Route path="/admin/materials" element={<AdminMaterialsPage />} />
    <Route path="/admin/assessments" element={<AdminAssessmentBuilderPage />} />
    <Route path="/admin/checklists" element={<AdminChecklistsPage />} />
    <Route path="/admin/assignments" element={<AdminAssignmentCompletionPage />} />
    <Route path="/admin/results" element={<AdminResultsCertificatesPage />} />
  </>;
}
