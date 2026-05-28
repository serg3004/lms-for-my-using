import { useTranslation } from 'react-i18next';

import { LearnerCourseDetailPage } from './LearnerCourseDetailPage.js';
import { LearnerCoursesPage } from './LearnerCoursesPage.js';
import { LearnerHomePage } from './LearnerHomePage.js';
import { LearnerLessonDetailPage } from './LearnerLessonDetailPage.js';
import { LearnerLessonsPage } from './LearnerLessonsPage.js';
import { LoginPage } from './LoginPage.js';

const courseDetailPathPrefix = '/learn/courses/';
const lessonsPathSuffix = '/lessons';
const lessonDetailPathPrefix = '/learn/lessons/';

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
      </nav>
    </main>
  );
}
