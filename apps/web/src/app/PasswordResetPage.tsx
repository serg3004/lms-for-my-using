import { cloneElement, FormEvent, type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { confirmPasswordReset, requestPasswordReset } from '../shared/api/auth.js';
import { ApiClientError } from '../shared/apiClient.js';
import { SkipLink } from '../shared/ui.js';

const locales = ['ru', 'en', 'kk', 'zh'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,255}$/;

type View = 'request' | 'sent' | 'confirm' | 'invalid' | 'success';

export function PasswordResetPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [view, setView] = useState<View>(token.length >= 32 ? 'confirm' : token ? 'invalid' : 'request');
  const [organizationId, setOrganizationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locale = (i18n.resolvedLanguage ?? i18n.language).split('-')[0];

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!organizationId.trim()) nextErrors.organizationId = t('passwordReset.required');
    else if (!uuidPattern.test(organizationId.trim())) nextErrors.organizationId = t('passwordReset.organizationInvalid');
    if (!email.trim()) nextErrors.email = t('passwordReset.required');
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = t('passwordReset.emailInvalid');
    setErrors(nextErrors);
    setErrorMessage(null);
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    try {
      await requestPasswordReset({ organizationId: organizationId.trim(), email: email.trim() });
      setView('sent');
    } catch {
      setErrorMessage(t('passwordReset.requestError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!strongPasswordPattern.test(password)) nextErrors.password = t('passwordReset.passwordInvalid');
    if (password !== passwordConfirmation) nextErrors.passwordConfirmation = t('passwordReset.passwordMismatch');
    setErrors(nextErrors);
    setErrorMessage(null);
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    try {
      await confirmPasswordReset({ token, password });
      setPassword('');
      setPasswordConfirmation('');
      setView('success');
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 400) setView('invalid');
      else setErrorMessage(t('passwordReset.confirmError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusView = view === 'sent' || view === 'invalid' || view === 'success';
  const statusTitle = view === 'sent' ? 'sentTitle' : view === 'success' ? 'successTitle' : 'invalidTitle';
  const statusCopy = view === 'sent' ? 'sent' : view === 'success' ? 'success' : 'invalid';

  return <>
    <SkipLink label={t('a11y.skipToContent')} />
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-hero" aria-labelledby="password-reset-hero-title">
        <div className="login-hero__brand">LearnSpace</div>
        <div className="login-hero__content"><h1 id="password-reset-hero-title">{t('passwordReset.heroTitle')}</h1><p>{t('passwordReset.heroText')}</p></div>
        <div className="login-hero__footer">LearnSpace</div>
      </section>
      <section className="login-side">
        <label className="password-reset-language">
          <span className="sr-only">{t('passwordReset.language')}</span>
          <select aria-label={t('passwordReset.language')} value={locale} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
            {locales.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
          </select>
        </label>
        <div className="login-card">
          {statusView ? <div className="password-reset-status" role="status">
            <div className="password-reset-status__icon" aria-hidden="true">{view === 'success' ? '✓' : view === 'sent' ? '✉' : '!'}</div>
            <header className="login-header"><h2>{t(`passwordReset.${statusTitle}`)}</h2><p>{t(`passwordReset.${statusCopy}`)}</p></header>
            {view === 'invalid' ? <Link className="login-form__submit password-reset-link" to="/password-reset">{t('passwordReset.retry')}</Link> : null}
            <Link className="password-reset-secondary" to="/login">{t('passwordReset.backToLogin')}</Link>
          </div> : <>
            <header className="login-header"><h2>{t(view === 'confirm' ? 'passwordReset.confirmTitle' : 'passwordReset.requestTitle')}</h2><p>{t(view === 'confirm' ? 'passwordReset.confirmSubtitle' : 'passwordReset.requestSubtitle')}</p></header>
            <form className="login-form" onSubmit={view === 'confirm' ? submitPassword : submitRequest}>
              {view === 'request' ? <>
                <ResetField id="reset-organization" label={t('passwordReset.organizationId')} error={errors.organizationId}><input id="reset-organization" autoComplete="organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} /></ResetField>
                <ResetField id="reset-email" label={t('passwordReset.email')} error={errors.email}><input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></ResetField>
              </> : <>
                <ResetField id="reset-password" label={t('passwordReset.password')} error={errors.password}><input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></ResetField>
                <ResetField id="reset-password-confirmation" label={t('passwordReset.confirmPassword')} error={errors.passwordConfirmation}><input id="reset-password-confirmation" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></ResetField>
              </>}
              {errorMessage ? <p className="login-form__error" role="alert">{errorMessage}</p> : null}
              <button className="login-form__submit" disabled={isSubmitting} type="submit">{t(view === 'confirm' ? (isSubmitting ? 'passwordReset.submitting' : 'passwordReset.submit') : (isSubmitting ? 'passwordReset.requesting' : 'passwordReset.request'))}</button>
              <Link className="password-reset-secondary" to="/login">{t('passwordReset.backToLogin')}</Link>
            </form>
          </>}
        </div>
      </section>
    </main>
  </>;
}

function ResetField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }> }) {
  const input = cloneElement(children, { required: true, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined });
  return <><label htmlFor={id}>{label}{input}</label>{error ? <p className="login-form__field-error" id={`${id}-error`} role="alert">{error}</p> : null}</>;
}
