import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { badgeTokenFrom } from '../features/badge/badgeToken.js';
import { loadEmployeeCardPhoto, markEmployeeCardChecked, openEmployeeCard, recordAnonymousScan, type DatedStatus, type EmployeeCard } from '../shared/api/employeeCard.js';
import { ApiClientError } from '../shared/apiClient.js';
import { formatDate } from '../shared/formatDate.js';

type State = { step: 'noToken' | 'loading' | 'anonymous' | 'notFound' | 'notAllowed' | 'error' } | { step: 'card'; card: EmployeeCard };

const statusMark: Record<DatedStatus, string> = { done: '✓', overdue: '!', open: '…' };

/**
 * PR 507: `/employee-card`, the card of an employee opened from the badge QR. The token is taken out of the address at once and
 * kept only here. Without a session the answer is only a warning (and one line in the journal); nothing about the person is shown.
 */
export function EmployeeCardPage() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(() => badgeTokenFrom(window.location.hash.replace(/^#/, '')));
  const [state, setState] = useState<State>(() => (token ? { step: 'loading' } : { step: 'noToken' }));

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setState({ step: 'loading' });
    openEmployeeCard(token)
      .then((card) => { if (active) setState({ step: 'card', card }); })
      .catch((error) => {
        if (!active) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        if (status === 401) { void recordAnonymousScan(token).catch(() => undefined); setState({ step: 'anonymous' }); return; }
        setState({ step: status === 404 ? 'notFound' : status === 403 ? 'notAllowed' : 'error' });
      });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-side" style={{ width: '100%' }}>
        <div className="login-card" style={{ maxWidth: '42rem' }}>
          <header className="login-header"><h1 style={{ fontSize: '1.5rem', margin: 0 }}>{t('employeeCard.page.title')}</h1></header>
          {state.step === 'loading' && <p role="status">{t('employeeCard.page.loading')}</p>}
          {state.step === 'noToken' && <ScanForm onToken={setToken} />}
          {state.step === 'anonymous' && (
            <div role="alert" style={{ display: 'grid', gap: '0.75rem', textAlign: 'center' }}>
              <p aria-hidden="true" style={{ fontSize: '3rem', margin: 0 }}>😬</p>
              <h2 style={{ margin: 0 }}>{t('employeeCard.page.anonymousTitle')}</h2>
              <p style={{ margin: 0 }}>{t('employeeCard.page.anonymousText')}</p>
              <Link className="login-form__submit" to="/login" style={{ textAlign: 'center' }}>{t('employeeCard.page.toLogin')}</Link>
            </div>
          )}
          {(state.step === 'notFound' || state.step === 'notAllowed' || state.step === 'error') && <p role="alert">{t(`employeeCard.page.${state.step}`)}</p>}
          {state.step === 'card' && token && <CardView card={state.card} token={token} />}
        </div>
      </section>
    </main>
  );
}

function ScanForm({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const token = badgeTokenFrom(text);
    if (!token) { setInvalid(true); return; }
    onToken(token);
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.5rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{t('employeeCard.page.scanTitle')}</h2>
      <p style={{ margin: 0 }}>{t('employeeCard.page.scanHint')}</p>
      <label htmlFor="employee-card-link">{t('employeeCard.page.scanLabel')}</label>
      <input id="employee-card-link" autoComplete="off" value={text} onChange={(event) => { setText(event.target.value); setInvalid(false); }} />
      {invalid ? <p role="alert" style={{ margin: 0 }}>{t('employeeCard.page.scanInvalid')}</p> : null}
      <button className="login-form__submit" type="submit">{t('employeeCard.page.scanSubmit')}</button>
    </form>
  );
}

function CardView({ card, token }: { card: EmployeeCard; token: string }) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<string | null>(null);
  const [checked, setChecked] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!card.subject.hasPhoto) return;
    let url: string | null = null;
    let active = true;
    loadEmployeeCardPhoto(token).then((made) => { url = made; if (active) setPhoto(made); else URL.revokeObjectURL(made); }).catch(() => undefined);
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [card.subject.hasPhoto, token]);

  async function markChecked() {
    setChecked('busy');
    try { await markEmployeeCardChecked(token); setChecked('done'); } catch { setChecked('error'); }
  }

  const { subject } = card;
  const facts: Array<[string, string | null | undefined]> = [
    [t('employeeCard.fields.position'), subject.position], [t('employeeCard.fields.department'), subject.department], [t('employeeCard.fields.employeeNumber'), subject.employeeNumber],
    [t('employeeCard.fields.email'), subject.email], [t('employeeCard.fields.phone'), subject.phone],
  ];
  const day = (value: string) => formatDate(value, undefined, { dateStyle: 'medium' });
  const word = (status: DatedStatus) => `${statusMark[status]} ${t(`employeeCard.status.${status}`)}`;
  const clearance = card.clearance;

  return (
    <article style={{ display: 'grid', gap: '1rem' }} aria-label={subject.name}>
      <header style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {photo ? <img alt={t('employeeCard.page.photoAlt')} src={photo} width={96} height={96} style={{ borderRadius: '0.5rem', objectFit: 'cover' }} /> : null}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, overflowWrap: 'anywhere' }}>{subject.name}</h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>{t('employeeCard.page.viewer')}: {t(`employeeCard.page.level.${card.level}`)}</p>
        </div>
      </header>
      <dl style={{ margin: 0, display: 'grid', gap: '0.25rem' }}>
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}><dt style={{ display: 'inline', fontWeight: 700 }}>{label}: </dt><dd style={{ display: 'inline', margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>
        ))}
      </dl>

      {clearance ? (
        <section aria-labelledby="card-clearance">
          <h3 id="card-clearance" style={{ margin: 0 }}>{t('employeeCard.blocks.clearance')}</h3>
          <p role="status" style={{ margin: '0.25rem 0', fontWeight: 700, fontSize: '1.25rem' }}>{clearance.ok ? '✓ ' : '✗ '}{t(clearance.ok ? 'employeeCard.clearance.ok' : 'employeeCard.clearance.notOk')}</p>
          {clearance.overdueCourses !== undefined ? (
            <ul style={{ margin: 0 }}>
              <li>{t('employeeCard.clearance.overdueCourses')}: {clearance.overdueCourses}</li>
              <li>{t('employeeCard.clearance.overdueChecklists')}: {clearance.overdueChecklists}</li>
              <li>{t('employeeCard.clearance.revokedCertificates')}: {clearance.revokedCertificates}</li>
            </ul>
          ) : null}
        </section>
      ) : null}

      {card.courses ? (
        <section aria-labelledby="card-courses">
          <h3 id="card-courses" style={{ margin: 0 }}>{t('employeeCard.blocks.courses')}</h3>
          {card.courses.length === 0 ? <p style={{ margin: 0 }}>{t('employeeCard.page.noData')}</p> : (
            <ul style={{ margin: 0 }}>{card.courses.map((course, index) => <li key={`${course.title}-${index}`}>{course.title}: {word(course.status)}{course.dueAt ? `, ${t('employeeCard.status.due')} ${day(course.dueAt)}` : ''}</li>)}</ul>
          )}
        </section>
      ) : null}

      {card.certificates ? (
        <section aria-labelledby="card-certificates">
          <h3 id="card-certificates" style={{ margin: 0 }}>{t('employeeCard.blocks.certificates')}</h3>
          {card.certificates.length === 0 ? <p style={{ margin: 0 }}>{t('employeeCard.page.noData')}</p> : (
            <ul style={{ margin: 0 }}>{card.certificates.map((certificate, index) => <li key={`${certificate.title}-${index}`}>{certificate.title}: {certificate.status === 'valid' ? '✓' : '✗'} {t(`employeeCard.status.${certificate.status}`)}, {t('employeeCard.status.issued')} {day(certificate.issuedAt)}</li>)}</ul>
          )}
        </section>
      ) : null}

      {card.checklists ? (
        <section aria-labelledby="card-checklists">
          <h3 id="card-checklists" style={{ margin: 0 }}>{t('employeeCard.blocks.checklists')}</h3>
          {card.checklists.length === 0 ? <p style={{ margin: 0 }}>{t('employeeCard.page.noData')}</p> : (
            <ul style={{ margin: 0 }}>{card.checklists.map((item, index) => (
              <li key={`${item.title}-${index}`}>{item.title}: {word(item.status)}{item.passed === undefined ? '' : `, ${t(item.passed ? 'employeeCard.status.passed' : 'employeeCard.status.notPassed')}`}{item.percentage === undefined ? '' : ` (${item.percentage}%)`}</li>
            ))}</ul>
          )}
        </section>
      ) : null}

      <div className="no-print" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="login-form__submit" disabled={checked === 'busy' || checked === 'done'} type="button" onClick={() => void markChecked()}>{t('employeeCard.page.markChecked')}</button>
        <button className="password-reset-secondary" type="button" onClick={() => window.print()} style={{ minHeight: '2.5rem', cursor: 'pointer' }}>{t('employeeCard.page.print')}</button>
      </div>
      {checked === 'done' && <p role="status" style={{ margin: 0 }}>{t('employeeCard.page.checkedDone')}</p>}
      {checked === 'error' && <p role="alert" style={{ margin: 0 }}>{t('employeeCard.page.checkedError')}</p>}
    </article>
  );
}
