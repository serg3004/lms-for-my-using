import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../shared/formatDate.js';

import { getCertificate, getCertificatePdfPath } from '../shared/apiClient.js';
import { getCurrentUser } from '../shared/api/auth.js';
import type { CurrentUser } from '../shared/api/types.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

function formatIssuedAt(value: string): string {
  return formatDate(value, undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function LearnerCertificateDetailPage({ certificateId }: { certificateId: string }) {
  const { t } = useTranslation();
  const [owner, setOwner] = useState<CurrentUser | null>(null);

  const { state: loadState } = useAsyncData(
    () => getCertificate(certificateId),
    [certificateId, t],
    { unauthenticated: t('certificates.sessionExpired'), error: t('certificates.loadError') },
  );

  useEffect(() => {
    if (loadState.status === 'loaded') {
      getCurrentUser()
        .then(setOwner)
        .catch(() => setOwner(null));
    }
  }, [loadState]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const certificatesAction = <a href="/learn/certificates">{t('certificates.navLink')}</a>;

  if (loadState.status === 'loading') {
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

  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return (
      <>
        <PageState title={t('certificates.detailTitle')} message={loadState.message} variant="error" action={certificatesAction} />
      </>
    );
  }

  const certificate = loadState.data;
  const organizationName = getReadableTitle(certificate.organization?.name, t('certificates.organizationFallback', 'Organization'));
  const courseTitle = getReadableTitle(certificate.course?.title, t('certificates.courseFallback', 'Course'));
  const ownerName = getReadableTitle(
    owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    t('certificates.ownerFallback', 'Learner'),
  );

  const verificationCode = `LMS-${certificate.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const isIssued = certificate.status === 'issued';

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: courseTitle, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  return (
    <div className="learner-cert-page">
      <nav className="learner-breadcrumb no-print">
        <a href="/learn/certificates">{t('certificates.navLink')}</a>
      </nav>

      <section
        className="no-print"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px', flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {t('certificates.detailEyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,38px)', fontWeight: 800, color: '#172033', lineHeight: 1.2 }}>
            {t('certificates.detailH1')}
          </h1>
          <p style={{ margin: '10px 0 0', color: '#6b7280', lineHeight: 1.6 }}>
            {t('certificates.detailSubtitle')}
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '999px', background: isIssued ? '#e9f8f2' : '#fef2f2', color: isIssued ? '#0f9f6e' : '#dc2626', fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap' }}>
          ● {isIssued ? t('certificates.statusIssued') : t('certificates.statusRevoked')}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(280px,.7fr)', gap: '22px', alignItems: 'start', width: '100%' }}>
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
            <button className="learner-btn learner-btn--primary" type="button" onClick={() => window.print()}>
              {t('certificates.printBtn')}
            </button>
            <a className="learner-btn learner-btn--secondary" href="/learn/certificates">
              {t('certificates.navLink')}
            </a>
          </div>
        </div>

        <aside className="no-print" style={{ display: 'grid', gap: '18px', position: 'sticky', top: '98px' }}>
          <section style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
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
          </section>

          <section style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#172033' }}>{t('certificates.actionsTitle')}</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <a className="learner-btn learner-btn--primary" href={getCertificatePdfPath(certificate.id)} download>
                {t('certificates.downloadPdf')}
              </a>
              <button className="learner-btn learner-btn--primary" type="button" onClick={() => window.print()}>
                {t('certificates.printBtn')}
              </button>
              <button className="learner-btn learner-btn--secondary" type="button" onClick={() => void handleShare()}>
                {t('certificates.shareBtn')}
              </button>
            </div>
          </section>

          <section style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px', color: '#172033' }}>{t('certificates.verificationTitle')}</h3>
            <p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: '13px', lineHeight: 1.55 }}>
              {t('certificates.verificationText')}
            </p>
            <code style={{ display: 'block', padding: '8px 10px', borderRadius: '9px', background: '#f8fafc', border: '1px solid #e3e8ef', color: '#172033', overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: '13px' }}>
              {verificationCode}
            </code>
          </section>
        </aside>
      </div>
    </div>
  );
}
