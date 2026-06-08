import { useTranslation } from 'react-i18next';

export function LearnerHomePage() {
  const { t } = useTranslation();

  return (
    <>
      <h1>{t('learner.title')}</h1>
      <nav>
        <a href="/learn/courses">{t('courses.navLink')}</a>
        <a href="/learn/progress">{t('progress.navLink')}</a>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </nav>
    </>
  );
}
