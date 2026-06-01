import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssignmentSummary, listAssignments } from '../shared/apiClient.js';
import { getListItemLabel, getReadableTitle } from '../shared/displayLabels.js';

type ReadableAssignmentSummary = AssignmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
  userName?: string | null;
  groupName?: string | null;
};

type AssignmentsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assignments: ReadableAssignmentSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getAssignmentHref(assignmentId: string) {
  return `/learn/assignments/${encodeURIComponent(assignmentId)}`;
}

function getCourseTitle(assignment: ReadableAssignmentSummary, fallback: string) {
  return getReadableTitle(assignment.courseTitle ?? assignment.course?.title, fallback);
}

function getAssignmentAudience(assignment: ReadableAssignmentSummary, fallback: string) {
  return getReadableTitle(assignment.userName ?? assignment.groupName, fallback);
}

function formatAssignmentDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

export function LearnerAssignmentsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssignmentsLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssignments() {
      setLoadState({ status: 'loading' });

      try {
        const assignments = await listAssignments();

        if (isMounted) {
          setLoadState({ status: 'loaded', assignments });
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

        setLoadState({
          status: 'error',
          message: t('assignments.loadError'),
        });
      }
    }

    void loadAssignments();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('assignments.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('assignments.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <h1>{t('assignments.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn">{t('learner.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn">{t('learner.navLink')}</a>
      </nav>

      <h1>{t('assignments.title')}</h1>

      {loadState.assignments.length === 0 ? (
        <p>{t('assignments.empty')}</p>
      ) : (
        <ul>
          {loadState.assignments.map((assignment, index) => (
            <li key={assignment.id}>
              <article>
                <h2>
                  <a href={getAssignmentHref(assignment.id)}>
                    {getListItemLabel('Assignment', index)}
                  </a>
                </h2>
                <dl>
                  <dt>{t('assignments.courseId')}</dt>
                  <dd>{getCourseTitle(assignment, 'Course')}</dd>
                  <dt>{t('assignments.userId')}</dt>
                  <dd>{getAssignmentAudience(assignment, t('assignments.notAvailable'))}</dd>
                  <dt>{t('assignments.status')}</dt>
                  <dd>{assignment.status}</dd>
                  <dt>{t('assignments.dueAt')}</dt>
                  <dd>{formatAssignmentDate(assignment.dueAt, t('assignments.notAvailable'))}</dd>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
