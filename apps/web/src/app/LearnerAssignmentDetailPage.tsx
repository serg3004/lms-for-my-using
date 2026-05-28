import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssignmentSummary, getAssignment } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type AssignmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assignment: AssignmentSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function formatAssignmentDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

export function LearnerAssignmentDetailPage({ assignmentId }: { assignmentId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssignmentDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssignment() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('assignments.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const assignment = await getAssignment(assignmentId);

        if (isMounted) {
          setLoadState({ status: 'loaded', assignment });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('assignments.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('assignments.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('assignments.loadError'),
        });
      }
    }

    void loadAssignment();

    return () => {
      isMounted = false;
    };
  }, [assignmentId, t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('assignments.loadingDetail')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('assignments.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('assignments.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
        <a href={getCourseHref(loadState.assignment.courseId)}>{t('courseDetail.title')}</a>
      </nav>

      <article>
        <h1>{t('assignments.detailTitle')}</h1>
        <dl>
          <dt>{t('assignments.assignmentId')}</dt>
          <dd>{loadState.assignment.id}</dd>
          <dt>{t('assignments.courseId')}</dt>
          <dd>{loadState.assignment.courseId}</dd>
          <dt>{t('assignments.userId')}</dt>
          <dd>{loadState.assignment.userId ?? t('assignments.notAvailable')}</dd>
          <dt>{t('assignments.groupId')}</dt>
          <dd>{loadState.assignment.groupId ?? t('assignments.notAvailable')}</dd>
          <dt>{t('assignments.status')}</dt>
          <dd>{loadState.assignment.status}</dd>
          <dt>{t('assignments.dueAt')}</dt>
          <dd>{formatAssignmentDate(loadState.assignment.dueAt, t('assignments.notAvailable'))}</dd>
        </dl>
      </article>
    </main>
  );
}
