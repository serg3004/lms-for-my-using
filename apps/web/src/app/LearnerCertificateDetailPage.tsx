import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CertificateSummary, getCertificate } from '../shared/apiClient.js';
import { getReadableTitle } from '../shared/displayLabels.js';

type ReadableCertificateSummary = CertificateSummary & {
  courseTitle?: string | null;
  userName?: string | null;
  assessmentTitle?: string | null;
  course?: { title?: string | null } | null;
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  assessmentAttempt?: { assessment?: { title?: string | null } | null } | null;
};

type CertificateDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; certificate: ReadableCertificateSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function formatCertificateDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

function getCourseTitle(certificate: ReadableCertificateSummary, fallback: string) {
  return getReadableTitle(certificate.courseTitle ?? certificate.course?.title, fallback);
}

function getUserDisplayName(certificate: ReadableCertificateSummary, fallback: string) {
  const fullName = [certificate.user?.firstName, certificate.user?.lastName].filter(Boolean).join(' ');
  const displayName = certificate.userName ?? (fullName || certificate.user?.email);

  return getReadableTitle(displayName, fallback);
}

function getAssessmentTitle(certificate: ReadableCertificateSummary, fallback: string) {
  return getReadableTitle(
    certificate.assessmentTitle ?? certificate.assessmentAttempt?.assessment?.title,
    fallback,
  );
}

export function LearnerCertificateDetailPage({ certificateId }: { certificateId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CertificateDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCertificate() {
      setLoadState({ status: 'loading' });

      try {
        const certificate = await getCertificate(certificateId);

        if (isMounted) {
          setLoadState({ status: 'loaded', certificate });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('certificates.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('certificates.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('certificates.loadError'),
        });
      }
    }

    void loadCertificate();

    return () => {
      isMounted = false;
    };
  }, [certificateId, t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('certificates.loadingDetail')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('certificates.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('certificates.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </main>
    );
  }

  const courseTitle = getCourseTitle(loadState.certificate, 'Course');

  return (
    <main>
      <nav>
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
        <a href={getCourseHref(loadState.certificate.courseId)}>{courseTitle}</a>
      </nav>

      <article>
        <h1>{t('certificates.detailTitle')}</h1>
        <dl>
          <dt>{t('certificates.course', 'Course')}</dt>
          <dd>{courseTitle}</dd>
          <dt>{t('certificates.learner', 'Learner')}</dt>
          <dd>{getUserDisplayName(loadState.certificate, t('certificates.notAvailable'))}</dd>
          <dt>{t('certificates.assessment', 'Assessment')}</dt>
          <dd>{getAssessmentTitle(loadState.certificate, t('certificates.notAvailable'))}</dd>
          <dt>{t('certificates.status')}</dt>
          <dd>{loadState.certificate.status}</dd>
          <dt>{t('certificates.issuedAt')}</dt>
          <dd>
            {formatCertificateDate(
              loadState.certificate.issuedAt,
              t('certificates.notAvailable'),
            )}
          </dd>
          <dt>{t('certificates.revokedAt')}</dt>
          <dd>
            {formatCertificateDate(
              loadState.certificate.revokedAt,
              t('certificates.notAvailable'),
            )}
          </dd>
        </dl>
      </article>
    </main>
  );
}
