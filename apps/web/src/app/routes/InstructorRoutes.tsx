import { lazy } from 'react';
import { Navigate, Outlet, Route, useParams } from 'react-router-dom';

import { NotFoundPage } from '../NotFoundPage.js';

const InstructorDashboardPage = lazy(() => import('../InstructorDashboardPage.js').then((m) => ({ default: m.InstructorDashboardPage })));
const InstructorCoursesPage = lazy(() => import('../InstructorCoursesPage.js').then((m) => ({ default: m.InstructorCoursesPage })));
const InstructorCourseFormPage = lazy(() => import('../InstructorCourseFormPage.js').then((m) => ({ default: m.InstructorCourseFormPage })));
const InstructorCourseStudentsPage = lazy(() => import('../InstructorCourseStudentsPage.js').then((m) => ({ default: m.InstructorCourseStudentsPage })));

function CourseEditRoute() { const { courseId } = useParams(); return courseId ? <InstructorCourseFormPage mode="edit" courseId={courseId} /> : <NotFoundPage />; }
function CourseStudentsRoute() { const { courseId } = useParams(); return courseId ? <InstructorCourseStudentsPage courseId={courseId} /> : <NotFoundPage />; }

export function InstructorRoutes() {
  return (
    <Route path="/instructor" element={<Outlet />}>
      <Route index element={<Navigate replace to="/instructor/dashboard" />} />
      <Route path="dashboard" element={<InstructorDashboardPage />} />
      <Route path="courses" element={<InstructorCoursesPage />} />
      <Route path="courses/new" element={<InstructorCourseFormPage mode="create" />} />
      <Route path="courses/:courseId/edit" element={<CourseEditRoute />} />
      <Route path="courses/:courseId/students" element={<CourseStudentsRoute />} />
    </Route>
  );
}
