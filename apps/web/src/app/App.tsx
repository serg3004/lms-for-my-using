import { useTranslation } from 'react-i18next';

import { LearnerAssessmentDetailPage } from './LearnerAssessmentDetailPage.js';
import { LearnerAssessmentsPage } from './LearnerAssessmentsPage.js';
import { LearnerAssignmentDetailPage } from './LearnerAssignmentDetailPage.js';
import { LearnerAssignmentsPage } from './LearnerAssignmentsPage.js';
import { LearnerCourseDetailPage } from './LearnerCourseDetailPage.js';
import { LearnerCoursesPage } from './LearnerCoursesPage.js';
import { LearnerHomePage } from './LearnerHomePage.js';
import { LearnerLessonDetailPage } from './LearnerLessonDetailPage.js';
import { LearnerLessonMaterialsPage } from './LearnerLessonMaterialsPage.js';
import { LearnerLessonsPage } from './LearnerLessonsPage.js';
import { LearnerProgressPage } from './LearnerProgressPage.js';
import { LoginPage } from './LoginPage.js';

const assessmentDetailPathPrefix = '/learn/assessments/';
const assignmentDetailPathPrefix = '/learn/assignments/';
const courseDetailPathPrefix = '/learn/courses/';
const lessonsPathSuffix = '/lessons';
const lessonDetailPathPrefix = '/learn/lessons/';
const lessonMaterialsPathSuffix = '/materials';

export function App() {
  const { t } = useTranslation();
  const pathname = window.location.pathname;

  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/learn') {
    return <LearnerHomePage />;
  }

  if (pathname === '/learn/courses') {
    return <LearnerCoursesPage />;
  }

  if (pathname === '/learn/progress') {
    return <LearnerProgressPage />;
  }

  if (pathname === '/learn/assignments') {
    return <LearnerAssignmentsPage />;
  }

  if (pathname === '/learn/assessments') {
    return <LearnerAssessmentsPage />;
  }

  if (pathname.startsWith(assessmentDetailPathPrefix)) {
    const assessmentId = pathname.slice(assessmentDetailPathPrefix.length);

    if (assessmentId) {
      return <LearnerAssessmentDetailPage assessmentId={assessmentId} />;
    }
  }

  if (pathname.startsWith(assignmentDetailPathPrefix)) {
    const assignmentId = pathname.slice(assignmentDetailPathPrefix.length);

    if (assignmentId) {
      return <LearnerAssignmentDetailPage assignmentId={assignmentId} />;
    }
  }

  if (pathname.startsWith(lessonDetailPathPrefix) && pathname.endsWith(lessonMaterialsPathSuffix)) {
    const lessonId = pathname.slice(
      lessonDetailPathPrefix.length,
      -lessonMaterialsPathSuffix.length,
    );

    if (lessonId) {
      return <LearnerLessonMaterialsPage lessonId={lessonId} />;
    }
  }

  if (pathname.startsWith(lessonDetailPathPrefix)) {
    const lessonId = pathname.slice(lessonDetailPathPrefix.length);

    if (lessonId) {
      return <LearnerLessonDetailPage lessonId={lessonId} />;
    }
  }

  if (pathname.startsWith(courseDetailPathPrefix) && pathname.endsWith(lessonsPathSuffix)) {
    const courseId = pathname.slice(courseDetailPathPrefix.length, -lessonsPathSuffix.length);

    if (courseId) {
      return <LearnerLessonsPage courseId={courseId} />;
    }
  }

  if (pathname.startsWith(courseDetailPathPrefix)) {
    const courseId = pathname.slice(courseDetailPathPrefix.length);

    if (courseId) {
      return <LearnerCourseDetailPage courseId={courseId} />;
    }
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <nav>
        <a href="/login">{t('login.navLink')}</a>
        <a href="/learn">{t('learner.navLink')}</a>
        <a href="/learn/courses">{t('courses.navLink')}</a>
        <a href="/learn/progress">{t('progress.navLink')}</a>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
      </nav>
    </main>
  );
}
