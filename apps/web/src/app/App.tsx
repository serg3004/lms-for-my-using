import { useTranslation } from 'react-i18next';

import { LoginPage } from './LoginPage.js';

export function App() {
  const { t } = useTranslation();

  if (window.location.pathname === '/login') {
    return <LoginPage />;
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <p>
        <a href="/login">{t('login.navLink')}</a>
      </p>
    </main>
  );
}
