import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { logout } from '../shared/logout.js';

export function LogoutButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setErrorMessage(null);
    setIsLoggingOut(true);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setErrorMessage(t('logout.error', 'Could not log out. Please try again.'));
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div>
      <button disabled={isLoggingOut} onClick={handleLogout} type="button">
        {isLoggingOut ? t('logout.submitting', 'Logging out...') : t('logout.submit', 'Log out')}
      </button>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </div>
  );
}
