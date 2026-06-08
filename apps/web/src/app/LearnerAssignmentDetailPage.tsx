import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssignmentSummary, getAssignment } from '../shared/apiClient.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { getCourseHref } from '../shared/learnerRoutes.js';
import { PageState, StatusBadge } from '../shared/ui.js';

type ReadableAssignmentSummary = AssignmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
  userName?: string | null;
  groupName?: string | null;
};

type AssignmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assignment: ReadableAssignmentSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseTitle(assignment: ReadableAssignmentSummary, fallback: string) {
  return getReadableTitle(assignment.courseTitle ?? assignment.course?.title, fallback);
}

function getAssignmentAudience(assignment: ReadableAssignmentSummary, fallback: string) {
  return getReadableTitle(assignment.userName ?? assignment.groupName, fallback);
}

export function LearnerAssignmentDetailPage({ assignmentId }: { assignmentId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssignmentDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssignment() {
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

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const assignmentsAction = <a href="/learn/assignments">{t('assignments.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <>
        <PageState message={t('assignments.loadingDetail')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState title={t('assignments.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState
          title={t('assignments.detailTitle')}
          message={loadState.message}
          variant="error"
          action={assignmentsAction}
        />
      </>
    );
  }

  const courseTitle = getCourseTitle(loadState.assignment, 'Course');

  return (
    <>
      <nav>
        <a href="/learn/assignments">{t('assignments.navLink')}</a>
        <a href={getCourseHref(loadState.assignment.courseId)}>{courseTitle}</a>
      </nav>

      <article>
        <h1>{t('assignments.detailTitle')}</h1>
        <dl>
          <dt>{t('assignments.course', 'Course')}</dt>
          <dd>{courseTitle}</dd>
          <dt>{t('assignments.audience', 'Audience')}</dt>
          <dd>{getAssignmentAudience(loadState.assignment, t('assignments.notAvailable'))}</dd>
          <dt>{t('assignments.status')}</dt>
          <dd>
            <StatusBadge>{loadState.assignment.status}</StatusBadge>
          </dd>
          <dt>{t('assignments.dueAt')}</dt>
          <dd>{formatNullableDate(loadState.assignment.dueAt, t('assignments.notAvailable'))}</dd>
        </dl>
      </article>
    </>
  );
}
