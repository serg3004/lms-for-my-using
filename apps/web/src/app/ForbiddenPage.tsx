import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="forbidden-page">
      <div className="forbidden-card">
        <div aria-hidden="true" className="forbidden-card__code">403</div>
        <h1>{t('forbidden.title', 'Access denied')}</h1>
        <p>{t('forbidden.description', 'Your account does not have permission to view this page.')}</p>
        <div className="forbidden-card__actions">
          <Link className="ds-button ds-button--primary" to="/">
            {t('forbidden.homeLink', 'Go to home')}
          </Link>
          <button
            className="ds-button ds-button--secondary"
            onClick={() => navigate(-1)}
            type="button"
          >
            {t('forbidden.backLink', 'Go back')}
          </button>
        </div>
      </div>
    </main>
  );
}
