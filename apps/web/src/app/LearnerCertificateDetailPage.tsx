import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CertificateSummary,
  getCertificate,
} from '../shared/apiClient.js';
import { getCurrentUser } from '../shared/api/auth.js';
import type { CurrentUser } from '../shared/api/types.js';
import { getReadableTitle } from '../shared/displayLabels.js';
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
  const [owner, setOwner] = useState<CurrentUser | null>(null);

  const loadCertificate = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const certificate = await getCertificate(certificateId);

      setLoadState({
        status: 'loaded',
        certificate,
      });

      getCurrentUser()
        .then(setOwner)
        .catch(() => setOwner(null));
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
  const organizationName = getReadableTitle(certificate.organization?.name, t('certificates.organizationFallback', 'Organization'));
  const courseTitle = getReadableTitle(certificate.course?.title, t('certificates.courseFallback', 'Course'));
  const ownerName = getReadableTitle(
    owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    t('certificates.ownerFallback', 'Learner'),
  );

  return (
    <div className="learner-cert-page">
      <nav className="learner-breadcrumb no-print">
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(260px,.8fr)', gap: '22px', alignItems: 'start', width: '100%', maxWidth: '1000px' }}>
        <div>
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
            </div>
          </div>

          <div className="learner-cert-actions no-print" style={{ marginTop: '18px' }}>
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

        <aside className="no-print" style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '18px', color: '#172033' }}>{t('certificates.infoTitle')}</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
              <span style={{ color: '#6b7280' }}>{t('certificates.owner')}</span>
              <strong>{ownerName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
              <span style={{ color: '#6b7280' }}>{t('certificates.courseLabel')}</span>
              <strong>{courseTitle}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
              <span style={{ color: '#6b7280' }}>{t('certificates.completedAt')}</span>
              <strong>{formatIssuedAt(certificate.issuedAt)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
              <span style={{ color: '#6b7280' }}>{t('certificates.validity')}</span>
              <strong>{t('certificates.validityUnlimited')}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
