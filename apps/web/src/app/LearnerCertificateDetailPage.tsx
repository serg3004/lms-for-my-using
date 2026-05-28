import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CertificateSummary, getCertificate } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type CertificateDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; certificate: CertificateSummary }
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

export function LearnerCertificateDetailPage({ certificateId }: { certificateId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CertificateDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCertificate() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('certificates.authRequired'),
        });
        return;
      }

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

  return (
    <main>
      <nav>
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
        <a href={getCourseHref(loadState.certificate.courseId)}>{t('courseDetail.title')}</a>
      </nav>

      <article>
        <h1>{t('certificates.detailTitle')}</h1>
        <dl>
          <dt>{t('certificates.certificateId')}</dt>
          <dd>{loadState.certificate.id}</dd>
          <dt>{t('certificates.courseId')}</dt>
          <dd>{loadState.certificate.courseId}</dd>
          <dt>{t('certificates.userId')}</dt>
          <dd>{loadState.certificate.userId}</dd>
          <dt>{t('certificates.assessmentAttemptId')}</dt>
          <dd>{loadState.certificate.assessmentAttemptId ?? t('certificates.notAvailable')}</dd>
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
