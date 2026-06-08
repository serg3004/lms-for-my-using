import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CertificateSummary,
  getCertificate,
} from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';

type CertificateDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      certificate: CertificateSummary;
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

      setLoadState({
        status: 'loaded',
        certificate,
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
      <>
        <PageState message={t('certificates.loadingDetail')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState title={t('certificates.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState title={t('certificates.detailTitle')} message={loadState.message} variant="error" action={certificatesAction} />
      </>
    );
  }

  const { certificate } = loadState;
  const organizationName = certificate.organization?.name ?? certificate.organizationId;
  const courseTitle = certificate.course?.title ?? certificate.courseId;

  return (
    <div className="learner-cert-page">
      <nav className="learner-breadcrumb no-print">
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </nav>

      <div className="learner-cert-card" id="certificate">
        <div className="learner-cert-card__org">{organizationName}</div>

        <div className="learner-cert-card__seal" aria-hidden="true">*</div>

        <p className="learner-cert-card__type">{t('certificates.certType')}</p>

        <p className="learner-cert-card__presented">{t('certificates.presentedTo')}</p>

        <h1 className="learner-cert-card__course">{courseTitle}</h1>

        <p className="learner-cert-card__issued">
          {t('certificates.issuedOn', { date: formatIssuedAt(certificate.issuedAt) })}
        </p>

        <div className="learner-cert-card__footer">
          <span className="learner-cert-card__footer-org">{organizationName}</span>
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
    </div>
  );
}
