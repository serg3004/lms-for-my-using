import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CurrentUser, getCurrentUser } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getUserDisplayName(user: CurrentUser) {
  const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

  return fullName || user.email;
}

export function LearnerHomePage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('learner.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const user = await getCurrentUser();

        if (isMounted) {
          setLoadState({ status: 'authenticated', user });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('learner.sessionExpired'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('learner.loadError'),
        });
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('learner.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('learner.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <h1>{t('learner.title')}</h1>
        <p role="alert">{loadState.message}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('learner.title')}</h1>
      <nav>
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </nav>
      <section>
        <h2>{t('learner.profileTitle')}</h2>
        <dl>
          <dt>{t('learner.name')}</dt>
          <dd>{getUserDisplayName(loadState.user)}</dd>
          <dt>{t('learner.email')}</dt>
          <dd>{loadState.user.email}</dd>
          <dt>{t('learner.organizationId')}</dt>
          <dd>{loadState.user.organizationId}</dd>
        </dl>
      </section>
    </main>
  );
}
