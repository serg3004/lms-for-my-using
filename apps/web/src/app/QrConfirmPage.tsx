import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { approveQrLogin, denyQrLogin, inspectQrLogin, type QrRequestInfo } from '../shared/api/qrLogin.js';
import { ApiClientError } from '../shared/apiClient.js';
import { formatDate } from '../shared/formatDate.js';

type State =
  | { step: 'loading' }
  | { step: 'ready'; info: QrRequestInfo }
  | { step: 'signIn' | 'invalid' | 'error' | 'approved' | 'denied' | 'notAllowed' };

/**
 * PR 505: the phone side. The person, already signed in here, sees which device asks and when, and confirms or declines.
 * The code is read from the part of the address after `#`; it is never sent anywhere but to the confirmation call.
 */
export function QrConfirmPage() {
  const { t } = useTranslation();
  const [code] = useState(() => window.location.hash.replace(/^#/, ''));
  const [state, setState] = useState<State>({ step: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) { setState({ step: 'invalid' }); return; }
    inspectQrLogin(code)
      .then((info) => setState({ step: 'ready', info }))
      .catch((error) => {
        const status = error instanceof ApiClientError ? error.status : 0;
        setState({ step: status === 401 ? 'signIn' : status === 404 || status === 400 ? 'invalid' : 'error' });
      });
  }, [code]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await (approve ? approveQrLogin(code) : denyQrLogin(code));
      setState({ step: approve ? 'approved' : 'denied' });
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : 0;
      setState({ step: status === 403 ? 'notAllowed' : status === 404 || status === 400 ? 'invalid' : 'error' });
    } finally {
      setBusy(false);
    }
  }

  const message = state.step === 'ready' || state.step === 'loading' ? null : t(`qrLogin.confirm.${state.step}`);
  return (
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-side" style={{ width: '100%' }}>
        <div className="login-card">
          <header className="login-header"><h1 style={{ fontSize: '1.5rem', margin: 0 }}>{t('qrLogin.confirm.title')}</h1></header>
          {state.step === 'loading' && <p role="status">{t('qrLogin.starting')}</p>}
          {message && <p role={state.step === 'approved' || state.step === 'denied' ? 'status' : 'alert'}>{message}</p>}
          {state.step === 'signIn' && <Link className="login-form__forgot" to="/login">{t('qrLogin.confirm.toLogin')}</Link>}
          {state.step === 'ready' && <div style={{ display: 'grid', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>{t('qrLogin.confirm.question')}</p>
            <dl style={{ margin: 0, display: 'grid', gap: '0.25rem' }}>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('qrLogin.confirm.device')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{state.info.deviceLabel ?? t('qrLogin.confirm.unknown')}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('qrLogin.confirm.place')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{state.info.ipMasked ?? t('qrLogin.confirm.unknown')}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('qrLogin.confirm.time')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{formatDate(state.info.createdAt, undefined, { timeStyle: 'short', dateStyle: 'medium' })}</dd></div>
            </dl>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{t('qrLogin.confirm.warning')}</p>
            <button className="login-form__submit" disabled={busy} type="button" onClick={() => void decide(true)}>{t('qrLogin.confirm.approve')}</button>
            <button className="password-reset-secondary" disabled={busy} type="button" onClick={() => void decide(false)} style={{ minHeight: '2.5rem', cursor: 'pointer' }}>{t('qrLogin.confirm.deny')}</button>
          </div>}
        </div>
      </section>
    </main>
  );
}
