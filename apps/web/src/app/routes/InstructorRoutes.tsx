import { lazy } from 'react';
import { Navigate, Outlet, Route, useParams } from 'react-router-dom';

import { NotFoundPage } from '../NotFoundPage.js';

const LongreadEditorPage = lazy(() => import('../LongreadEditorPage.js').then((m) => ({ default: m.LongreadEditorPage })));

const InstructorDashboardPage = lazy(() => import('../InstructorDashboardPage.js').then((m) => ({ default: m.InstructorDashboardPage })));
const InstructorCoursesPage = lazy(() => import('../InstructorCoursesPage.js').then((m) => ({ default: m.InstructorCoursesPage })));
const InstructorCourseFormPage = lazy(() => import('../InstructorCourseFormPage.js').then((m) => ({ default: m.InstructorCourseFormPage })));
const InstructorCourseStudentsPage = lazy(() => import('../InstructorCourseStudentsPage.js').then((m) => ({ default: m.InstructorCourseStudentsPage })));
const InstructorChecklistReviewsPage = lazy(() => import('../InstructorChecklistReviewsPage.js').then((m) => ({ default: m.InstructorChecklistReviewsPage })));
const InstructorChecklistSessionsPage = lazy(() => import('../InstructorChecklistSessionsPage.js').then((m) => ({ default: m.InstructorChecklistSessionsPage })));
const AllSessionsPage = lazy(() => import('../AdminChecklistSessionsPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionsPage variant="observer" /> })));
const SessionReportPage = lazy(() => import('../AdminChecklistSessionReportPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionReportPage variant="observer" /> })));
const LibraryPage = lazy(() => import('../AdminChecklistsPage.js').then((m) => ({ default: () => <m.AdminChecklistsPage variant="observer" /> })));
const AnalyticsPage = lazy(() => import('../ObserverChecklistAnalyticsPage.js').then((m) => ({ default: m.ObserverChecklistAnalyticsPage })));
const InstructorChecklistSessionConductPage = lazy(() => import('../InstructorChecklistSessionConductPage.js').then((m) => ({ default: m.InstructorChecklistSessionConductPage })));

function CourseEditRoute() { const { courseId } = useParams(); return courseId ? <InstructorCourseFormPage mode="edit" courseId={courseId} /> : <NotFoundPage />; }
function CourseStudentsRoute() { const { courseId } = useParams(); return courseId ? <InstructorCourseStudentsPage courseId={courseId} /> : <NotFoundPage />; }
function ConductSessionRoute() { const { sessionId } = useParams(); return sessionId ? <InstructorChecklistSessionConductPage sessionId={sessionId} /> : <NotFoundPage />; }

export function InstructorRoutes() {
  return (
    <Route path="/instructor" element={<Outlet />}>
      <Route index element={<Navigate replace to="/instructor/dashboard" />} />
      <Route path="dashboard" element={<InstructorDashboardPage />} />
      <Route path="lessons/:id/longread" element={<LongreadEditorPage />} />
      <Route path="courses" element={<InstructorCoursesPage />} />
      <Route path="courses/new" element={<InstructorCourseFormPage mode="create" />} />
      <Route path="courses/:courseId/edit" element={<CourseEditRoute />} />
      <Route path="courses/:courseId/students" element={<CourseStudentsRoute />} />
      <Route path="checklists" element={<InstructorChecklistReviewsPage />} />
      <Route path="checklists/analytics" element={<AnalyticsPage />} />
      <Route path="checklists/library" element={<LibraryPage />} />
      <Route path="checklists/sessions" element={<InstructorChecklistSessionsPage />} />
      <Route path="checklists/sessions/all" element={<AllSessionsPage />} />
      <Route path="checklists/sessions/all/:id" element={<SessionReportPage />} />
      <Route path="checklists/sessions/:sessionId" element={<ConductSessionRoute />} />
    </Route>
  );
}
