import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CertificateSummary,
  CourseSummary,
  OrganizationSummary,
  getCertificate,
  getOrganization,
} from '../shared/apiClient.js';
import { getCourse } from '../shared/api/courses.js';
import { PageState } from '../shared/ui.js';

type CertificateDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      certificate: CertificateSummary;
      course: CourseSummary;
      organization: OrganizationSummary;
      learnerName: string;
    }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function formatIssuedAt(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function LearnerCertificateDetailPage({ certificateId }: { certificateId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CertificateDetailLoadState>({ status: 'idle' });

  const loadCertificate = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const certificate = await getCertificate(certificateId);

      const [course, organization] = await Promise.all([
        getCourse(certificate.courseId),
        getOrganization(certificate.organizationId),
      ]);

      setLoadState({
        status: 'loaded',
        certificate,
        course,
        organization,
        learnerName: '',
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({ status: 'unauthenticated', message: t('certificates.sessionExpired') });
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        setLoadState({ status: 'notFound', message: t('certificates.notFound') });
        return;
      }
      setLoadState({ status: 'error', message: t('certificates.loadError') });
    }
  }, [certificateId, t]);

  useEffect(() => {
    void loadCertificate();
  }, [loadCertificate]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const certificatesAction = <a href="/learn/certificates">{t('certificates.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('certificates.loadingDetail')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('certificates.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('certificates.detailTitle')} message={loadState.message} variant="error" action={certificatesAction} />
      </main>
    );
  }

  const { certificate, course, organization } = loadState;

  return (
    <main className="learner-cert-page">
      <nav className="learner-breadcrumb no-print">
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </nav>

      <div className="learner-cert-card" id="certificate">
        <div className="learner-cert-card__org">{organization.name}</div>

        <div className="learner-cert-card__seal" aria-hidden="true">★</div>

        <p className="learner-cert-card__type">{t('certificates.certType')}</p>

        <p className="learner-cert-card__presented">{t('certificates.presentedTo')}</p>

        <h1 className="learner-cert-card__course">{course.title}</h1>

        <p className="learner-cert-card__issued">
          {t('certificates.issuedOn', { date: formatIssuedAt(certificate.issuedAt) })}
        </p>

        <div className="learner-cert-card__footer">
          <span className="learner-cert-card__footer-org">{organization.name}</span>
          <span className="learner-cert-card__footer-id">#{certificate.id.slice(0, 8).toUpperCase()}</span>
        </div>
      </div>

      <div className="learner-cert-actions no-print">
        <button
          className="learner-btn learner-btn--primary"
          type="button"
          onClick={() => window.print()}
        >
          {t('certificates.printBtn')}
        </button>
        <a className="learner-btn learner-btn--secondary" href="/learn/certificates">
          {t('certificates.navLink')}
        </a>
      </div>
    </main>
  );
}
