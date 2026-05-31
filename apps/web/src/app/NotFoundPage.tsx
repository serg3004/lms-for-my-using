import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t('notFound.title', 'Page not found')}</h1>
      <p>{t('notFound.description', 'The requested page does not exist.')}</p>
      <Link to="/">{t('notFound.homeLink', 'Go to home')}</Link>
    </main>
  );
}
