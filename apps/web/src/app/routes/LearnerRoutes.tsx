import { lazy, type ComponentType } from 'react';
import { Outlet, Route, useParams } from 'react-router-dom';

import { NotFoundPage } from '../NotFoundPage.js';
import { LearnerPageLayout } from '../../shared/learnerLayout.js';

const LearnerAssessmentDetailPage = lazy(() => import('../LearnerAssessmentDetailPage.js').then((m) => ({ default: m.LearnerAssessmentDetailPage })));
const LearnerAssessmentReviewPage = lazy(() => import('../LearnerAssessmentReviewPage.js').then((m) => ({ default: m.LearnerAssessmentReviewPage })));
const LearnerAssessmentTakingPage = lazy(() => import('../LearnerAssessmentTakingPage.js').then((m) => ({ default: m.LearnerAssessmentTakingPage })));
const LearnerAssessmentsPage = lazy(() => import('../LearnerAssessmentsPage.js').then((m) => ({ default: m.LearnerAssessmentsPage })));
const LearnerAssignmentDetailPage = lazy(() => import('../LearnerAssignmentDetailPage.js').then((m) => ({ default: m.LearnerAssignmentDetailPage })));
const LearnerAssignmentsPage = lazy(() => import('../LearnerAssignmentsPage.js').then((m) => ({ default: m.LearnerAssignmentsPage })));
const LearnerCertificateDetailPage = lazy(() => import('../LearnerCertificateDetailPage.js').then((m) => ({ default: m.LearnerCertificateDetailPage })));
const LearnerCertificatesPage = lazy(() => import('../LearnerCertificatesPage.js').then((m) => ({ default: m.LearnerCertificatesPage })));
const LearnerChecklistsPage = lazy(() => import('../LearnerChecklistsPage.js').then((m) => ({ default: m.LearnerChecklistsPage })));
const LearnerCourseDetailPage = lazy(() => import('../LearnerCourseDetailPage.js').then((m) => ({ default: m.LearnerCourseDetailPage })));
const LearnerCoursesPage = lazy(() => import('../LearnerCoursesPage.js').then((m) => ({ default: m.LearnerCoursesPage })));
const LearnerHomePage = lazy(() => import('../LearnerHomePage.js').then((m) => ({ default: m.LearnerHomePage })));
const LearnerLessonDetailPage = lazy(() => import('../LearnerLessonDetailPage.js').then((m) => ({ default: m.LearnerLessonDetailPage })));
const LearnerLessonMaterialsPage = lazy(() => import('../LearnerLessonMaterialsPage.js').then((m) => ({ default: m.LearnerLessonMaterialsPage })));
const LearnerLessonsPage = lazy(() => import('../LearnerLessonsPage.js').then((m) => ({ default: m.LearnerLessonsPage })));
const LearnerNotificationsPage = lazy(() => import('../LearnerNotificationsPage.js').then((m) => ({ default: m.LearnerNotificationsPage })));
const LearnerProgressPage = lazy(() => import('../LearnerProgressPage.js').then((m) => ({ default: m.LearnerProgressPage })));

function ParamRoute<Param extends string>({ param, Page }: { param: Param; Page: ComponentType<Record<Param, string>> }) {
  const params = useParams();
  const value = params[param];
  return value ? <Page {...({ [param]: value } as Record<Param, string>)} /> : <NotFoundPage />;
}

function LearnerLayoutRoute() {
  return <LearnerPageLayout><Outlet /></LearnerPageLayout>;
}

export function LearnerRoutes() {
  return (
    <Route element={<LearnerLayoutRoute />}>
      <Route path="/learn" element={<LearnerHomePage />} />
      <Route path="/learn/courses" element={<LearnerCoursesPage />} />
      <Route path="/learn/progress" element={<LearnerProgressPage />} />
      <Route path="/learn/assignments" element={<LearnerAssignmentsPage />} />
      <Route path="/learn/assessments" element={<LearnerAssessmentsPage />} />
      <Route path="/learn/checklists" element={<LearnerChecklistsPage />} />
      <Route path="/learn/certificates" element={<LearnerCertificatesPage />} />
      <Route path="/learn/notifications" element={<LearnerNotificationsPage />} />
      <Route path="/learn/certificates/:certificateId" element={<ParamRoute param="certificateId" Page={LearnerCertificateDetailPage} />} />
      <Route path="/learn/assessments/:assessmentId/take" element={<ParamRoute param="assessmentId" Page={LearnerAssessmentTakingPage} />} />
      <Route path="/learn/assessments/:assessmentId" element={<ParamRoute param="assessmentId" Page={LearnerAssessmentDetailPage} />} />
      <Route path="/learn/attempts/:attemptId" element={<ParamRoute param="attemptId" Page={LearnerAssessmentReviewPage} />} />
      <Route path="/learn/assignments/:assignmentId" element={<ParamRoute param="assignmentId" Page={LearnerAssignmentDetailPage} />} />
      <Route path="/learn/lessons/:lessonId/materials" element={<ParamRoute param="lessonId" Page={LearnerLessonMaterialsPage} />} />
      <Route path="/learn/lessons/:lessonId" element={<ParamRoute param="lessonId" Page={LearnerLessonDetailPage} />} />
      <Route path="/learn/courses/:courseId/lessons" element={<ParamRoute param="courseId" Page={LearnerLessonsPage} />} />
      <Route path="/learn/courses/:courseId" element={<ParamRoute param="courseId" Page={LearnerCourseDetailPage} />} />
    </Route>
  );
}
