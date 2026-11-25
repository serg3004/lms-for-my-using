import { lazy } from 'react';
import { Navigate, Outlet, Route } from 'react-router-dom';

const ManagerAssessmentAnalyticsPage = lazy(() => import('../assessment-builder/AssessmentAnalyticsPage.js').then((m) => ({ default: m.ManagerAssessmentAnalyticsPage })));
const ManagerDashboardPage = lazy(() => import('../ManagerDashboardPage.js').then((m) => ({ default: m.ManagerDashboardPage })));
const ManagerTeamPage = lazy(() => import('../ManagerTeamPage.js').then((m) => ({ default: m.ManagerTeamPage })));
const ManagerOverduePage = lazy(() => import('../ManagerOverduePage.js').then((m) => ({ default: m.ManagerOverduePage })));
const ManagerCourseAnalyticsPage = lazy(() => import('../CourseAnalyticsPages.js').then((m) => ({ default: m.ManagerCourseAnalyticsPage })));
const ManagerReportsPage = lazy(() => import('../ManagerReportsPage.js').then((m) => ({ default: m.ManagerReportsPage })));
const ManagerSheetAnalyticsPage = lazy(() => import('../SheetAnalyticsPage.js').then((m) => ({ default: m.ManagerSheetAnalyticsPage })));
const ManagerChecklistsPage = lazy(() => import('../ManagerChecklistsPage.js').then((m) => ({ default: m.ManagerChecklistsPage })));

export function ManagerRoutes() {
  return (
    <Route path="/manager" element={<Outlet />}>
      <Route index element={<Navigate replace to="/manager/dashboard" />} />
      <Route path="dashboard" element={<ManagerDashboardPage />} />
      <Route path="team" element={<ManagerTeamPage />} />
      <Route path="overdue" element={<ManagerOverduePage />} />
      <Route path="reports/courses/*" element={<ManagerCourseAnalyticsPage />} />
      <Route path="reports/assessments" element={<ManagerAssessmentAnalyticsPage />} />
      <Route path="reports/assessments/:assessmentId" element={<ManagerAssessmentAnalyticsPage />} />
      <Route path="reports" element={<ManagerReportsPage />} />
      <Route path="checklists" element={<ManagerChecklistsPage />} />
      <Route path="checklists/sheets" element={<ManagerSheetAnalyticsPage />} />
      <Route path="checklists/sheets/:checklistId" element={<ManagerSheetAnalyticsPage />} />
    </Route>
  );
}
