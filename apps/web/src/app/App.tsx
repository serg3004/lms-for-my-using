import { useTranslation } from 'react-i18next';

import { LearnerHomePage } from './LearnerHomePage.js';
import { LoginPage } from './LoginPage.js';

export function App() {
  const { t } = useTranslation();
  const pathname = window.location.pathname;

  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/learn') {
    return <LearnerHomePage />;
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <nav>
        <a href="/login">{t('login.navLink')}</a>
        <a href="/learn">{t('learner.navLink')}</a>
      </nav>
    </main>
  );
}
