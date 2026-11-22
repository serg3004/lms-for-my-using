import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../shared/api/auth.js';
import { BadgeSignIn } from '../features/badge/BadgeSignIn.js';
import { badgeTokenFrom } from '../features/badge/badgeToken.js';

/** PR 506: `/badge`, the screen of a shared tablet or computer: scan the badge, type the PIN, do only what is assigned. */
export function BadgePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [initialToken] = useState(() => badgeTokenFrom(window.location.hash.replace(/^#/, '')));
  useEffect(() => {
    // PR 507: a signed-in person (not a kiosk session) who scans a badge opens the employee card instead of the PIN screen.
    if (!initialToken) return;
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled && user && !user.kiosk) navigate(`/employee-card#${initialToken}`, { replace: true });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialToken, navigate]);
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
