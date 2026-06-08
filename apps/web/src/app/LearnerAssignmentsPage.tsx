import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssignments } from '../shared/api/assignments.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { AssignmentSummary } from '../shared/api/types.js';
import { getListItemLabel, getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

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
      <>
        <PageState message={t('assignments.loading')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState
          title={t('assignments.title')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </>
    );
  }

  if (loadState.status === 'error') {
    return (
      <>
        <PageState
          title={t('assignments.title')}
          message={loadState.message}
          variant="error"
          action={<a href="/learn">{t('learner.navLink')}</a>}
        />
      </>
    );
  }

  return (
    <>
      <nav>
        <a href="/learn">{t('learner.navLink')}</a>
      </nav>

      <h1>{t('assignments.title')}</h1>

      {loadState.assignments.length === 0 ? (
        <EmptyState message={t('assignments.empty')} />
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
                  <dt>Course</dt>
                  <dd>{getCourseTitle(assignment, 'Course')}</dd>
                  <dt>Audience</dt>
                  <dd>{getAssignmentAudience(assignment, t('assignments.notAvailable'))}</dd>
                  <dt>{t('assignments.status')}</dt>
                  <dd>
                    <StatusBadge>{assignment.status}</StatusBadge>
                  </dd>
                  <dt>{t('assignments.dueAt')}</dt>
                  <dd>{formatNullableDate(assignment.dueAt, t('assignments.notAvailable'))}</dd>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
