import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CertificateSummary, listCertificates } from '../shared/apiClient.js';
import { getListItemLabel, getReadableTitle } from '../shared/displayLabels.js';

type ReadableCertificateSummary = CertificateSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
};

type CertificatesLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; certificates: ReadableCertificateSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getCertificateHref(certificateId: string) {
  return `/learn/certificates/${encodeURIComponent(certificateId)}`;
}

function getCourseTitle(certificate: ReadableCertificateSummary, fallback: string) {
  return getReadableTitle(certificate.courseTitle ?? certificate.course?.title, fallback);
}

function formatCertificateDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

export function LearnerCertificatesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CertificatesLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCertificates() {
      setLoadState({ status: 'loading' });

      try {
        const certificates = await listCertificates();

        if (isMounted) {
          setLoadState({ status: 'loaded', certificates });
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

        setLoadState({
          status: 'error',
          message: t('certificates.loadError'),
        });
      }
    }

    void loadCertificates();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('certificates.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('certificates.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <h1>{t('certificates.title')}</h1>
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

      <h1>{t('certificates.title')}</h1>

      {loadState.certificates.length === 0 ? (
        <p>{t('certificates.empty')}</p>
      ) : (
        <ul>
          {loadState.certificates.map((certificate, index) => (
            <li key={certificate.id}>
              <article>
                <h2>
                  <a href={getCertificateHref(certificate.id)}>
                    {getListItemLabel('Certificate', index)}
                  </a>
                </h2>
                <dl>
                  <dt>{t('certificates.course', 'Course')}</dt>
                  <dd>{getCourseTitle(certificate, 'Course')}</dd>
                  <dt>{t('certificates.status')}</dt>
                  <dd>{certificate.status}</dd>
                  <dt>{t('certificates.issuedAt')}</dt>
                  <dd>
                    {formatCertificateDate(
                      certificate.issuedAt,
                      t('certificates.notAvailable'),
                    )}
                  </dd>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
