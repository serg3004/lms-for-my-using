import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CurrentUser, getCurrentUser } from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';

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

  const loginAction = <a href="/login">{t('login.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('learner.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('learner.title')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('learner.title')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <main>
      <h1>{t('learner.title')}</h1>
      <nav>
        <a href="/learn/courses">{t('courses.navLink')}</a>
        <a href="/learn/progress">{t('progress.navLink')}</a>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
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
