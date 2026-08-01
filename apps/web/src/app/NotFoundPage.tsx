import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <div aria-hidden="true" className="not-found-card__code">404</div>
        <h1>{t('notFound.title', 'Page not found')}</h1>
        <p>{t('notFound.description', 'The requested page does not exist.')}</p>
        <div className="not-found-card__actions">
          <Link className="ds-button ds-button--primary" to="/">
            {t('notFound.homeLink', 'Go to home')}
          </Link>
          <button
            className="ds-button ds-button--secondary"
            onClick={() => navigate(-1)}
            type="button"
          >
            {t('notFound.backLink', 'Go back')}
          </button>
        </div>
      </div>
    </main>
  );
}
