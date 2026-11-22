import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { BadgeSignIn } from '../features/badge/BadgeSignIn.js';
import { badgeTokenFrom } from '../features/badge/badgeToken.js';

/** PR 506: `/badge`, the screen of a shared tablet or computer: scan the badge, type the PIN, do only what is assigned. */
export function BadgePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [initialToken] = useState(() => badgeTokenFrom(window.location.hash.replace(/^#/, '')));
  return (
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-side" style={{ width: '100%' }}>
        <div className="login-card">
          <header className="login-header"><h1 style={{ fontSize: '1.5rem', margin: 0 }}>{t('badge.scan.title')}</h1></header>
          <BadgeSignIn initialToken={initialToken} onSignedIn={() => navigate('/learn', { replace: true })} />
        </div>
      </section>
    </main>
  );
}
