import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CertificateSummary, listCertificates } from '../shared/apiClient.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ReadableCertificateSummary = CertificateSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
};

type LearnerCertificatesData = { certificates: ReadableCertificateSummary[]; total: number; pageSize: number };

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
};

const BANNER_GRADIENTS = [
  'radial-gradient(circle at top right,rgba(255,255,255,.18),transparent 32%),linear-gradient(135deg,#4338ca,#7c3aed)',
  'radial-gradient(circle at top right,rgba(255,255,255,.18),transparent 32%),linear-gradient(135deg,#047857,#10b981)',
  'radial-gradient(circle at top right,rgba(255,255,255,.20),transparent 32%),linear-gradient(135deg,#b45309,#f59e0b)',
];

function getCertificateHref(certificateId: string) {
  return `/learn/certificates/${encodeURIComponent(certificateId)}`;
}

function getCourseTitle(certificate: ReadableCertificateSummary, fallback: string) {
  return getReadableTitle(certificate.courseTitle ?? certificate.course?.title, fallback);
}

type StatusFilter = 'all' | 'issued' | 'revoked';

export function LearnerCertificatesPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [yearFilter, setYearFilter] = useState<'all' | string>('all');

  const { state: loadState } = useAsyncData<LearnerCertificatesData>(
    async () => {
      const result = await listCertificates({ page: 1, pageSize: 100 });
      return { certificates: result.items, total: result.total, pageSize: result.pageSize };
    },
    [t],
    { unauthenticated: t('certificates.sessionExpired'), error: t('certificates.loadError') },
  );

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const learnerAction = <a href="/learn">{t('learner.navLink')}</a>;

  const years = useMemo(() => {
    if (loadState.status !== 'loaded') return [];
    const set = new Set(loadState.data.certificates.map((c) => new Date(c.issuedAt).getFullYear().toString()));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [loadState]);

  const filtered = useMemo(() => {
    if (loadState.status !== 'loaded') return [];
    return loadState.data.certificates.filter((certificate) => {
      const matchesStatus = statusFilter === 'all' || certificate.status === statusFilter;
      const matchesYear =
        yearFilter === 'all' || new Date(certificate.issuedAt).getFullYear().toString() === yearFilter;
      return matchesStatus && matchesYear;
    });
  }, [loadState, statusFilter, yearFilter]);

  if (loadState.status === 'loading') {
    return <PageState message={t('certificates.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState title={t('certificates.title')} message={loadState.message} variant="error" action={loginAction} />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState title={t('certificates.title')} message={loadState.message} variant="error" action={learnerAction} />
    );
  }

  const { certificates } = loadState.data;
  const issuedCount = certificates.filter((c) => c.status === 'issued').length;
  const revokedCount = certificates.filter((c) => c.status === 'revoked').length;

  function downloadAll() {
    for (const certificate of filtered) {
      window.open(getCertificateHref(certificate.id), '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          {t('certificates.eyebrow')}
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{t('certificates.title')}</h1>
        <p style={{ margin: '10px 0 0', color: COLORS.muted, fontSize: '15px', maxWidth: '760px', lineHeight: 1.6 }}>
          {t('certificates.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '22px' }}>
        {[
          { value: certificates.length, label: t('certificates.statsTotal') },
          { value: issuedCount, label: t('certificates.statsIssued') },
          { value: revokedCount, label: t('certificates.statsRevoked') },
        ].map((s, i) => (
          <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '14px', padding: '18px' }}>
            <strong style={{ display: 'block', fontSize: '28px', color: COLORS.text }}>{s.value}</strong>
            <span style={{ color: COLORS.muted, fontSize: '13px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('certificates.filterAll')}</option>
          <option value="issued">{t('certificates.filterIssued')}</option>
          <option value="revoked">{t('certificates.filterRevoked')}</option>
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('certificates.filterAllYears')}</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={downloadAll}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 14px', fontWeight: 800, fontSize: '14px' }}
        >
          {t('certificates.downloadAll')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⌕</div>
          <strong style={{ fontSize: '16px', color: COLORS.text }}>{t('certificates.empty')}</strong>
          <p style={{ color: COLORS.muted, margin: '8px 0 0' }}>{t('certificates.emptyHint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
          {filtered.map((certificate, idx) => {
            const courseTitle = getCourseTitle(certificate, 'Course');
            const isIssued = certificate.status === 'issued';
            const bannerGradient = BANNER_GRADIENTS[idx % BANNER_GRADIENTS.length];
            const shortId = certificate.id.replace(/-/g, '').slice(0, 10).toUpperCase();

            return (
              <article
                key={certificate.id}
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 28px rgba(23,32,51,.07)' }}
              >
                <div style={{ padding: '22px', background: bannerGradient, color: '#fff' }}>
                  <small style={{ display: 'block', opacity: 0.85, marginBottom: '10px' }}>LearnSpace Certificate</small>
                  <strong style={{ fontSize: '19px' }}>{courseTitle}</strong>
                </div>
                <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignSelf: 'flex-start',
                      padding: '7px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      background: isIssued ? COLORS.successSoft : '#fef2f2',
                      color: isIssued ? COLORS.success : '#dc2626',
                    }}
                  >
                    {isIssued ? t('certificates.statusIssued') : t('certificates.statusRevoked')}
                  </span>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ color: COLORS.muted, fontSize: '13px' }}>{t('certificates.number')}</span>
                      <strong style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{shortId}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ color: COLORS.muted, fontSize: '13px' }}>{t('certificates.issuedAt')}</span>
                      <strong style={{ fontSize: '13px' }}>{formatNullableDate(certificate.issuedAt, t('certificates.notAvailable'))}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ color: COLORS.muted, fontSize: '13px' }}>{t('certificates.validity')}</span>
                      <strong style={{ fontSize: '13px' }}>{t('certificates.validityUnlimited')}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <a
                      href={getCertificateHref(certificate.id)}
                      style={{ flex: 1, border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 14px', fontWeight: 800, fontSize: '14px', textAlign: 'center', textDecoration: 'none', color: COLORS.text }}
                    >
                      {t('certificates.open')}
                    </a>
                    <a
                      href={getCertificateHref(certificate.id)}
                      style={{ flex: 1, border: `1px solid ${COLORS.primary}`, background: COLORS.primary, borderRadius: '12px', padding: '11px 14px', fontWeight: 800, fontSize: '14px', textAlign: 'center', textDecoration: 'none', color: '#fff' }}
                    >
                      {t('certificates.downloadPdf')}
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
