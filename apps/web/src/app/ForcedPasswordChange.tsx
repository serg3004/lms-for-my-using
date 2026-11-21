import { useTranslation } from 'react-i18next';

import { ChangePasswordForm } from '../shared/ChangePasswordForm.js';
import { useSession } from '../shared/session.js';
import { LogoutButton } from './LogoutButton.js';

/** PR 489: shown instead of any signed-in page while the user still has a temporary password; nothing else is available. */
export function ForcedPasswordChange() {
  const { t } = useTranslation();
  const { refreshUser } = useSession();

  return (
    <main className="learner-profile" id="main-content">
      <header>
        <h1>{t('security.forcedTitle')}</h1>
        <p>{t('security.forcedHint')}</p>
      </header>
      <ChangePasswordForm onChanged={() => void refreshUser()} />
      <LogoutButton />
    </main>
  );
}
