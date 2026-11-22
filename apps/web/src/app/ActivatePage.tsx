import { cloneElement, FormEvent, type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { activateByIdentity, inspectActivationQr } from '../shared/api/auth.js';
import { ApiClientError } from '../shared/apiClient.js';
import { LoginLanguageMenu } from '../shared/LoginLanguageMenu.js';
import { PasswordInput } from '../shared/PasswordInput.js';
import { passwordViolationMessages } from '../shared/passwordPolicyErrors.js';
import { SkipLink } from '../shared/ui.js';

type Form = { organizationId: string; employeeNumber: string; lastName: string; firstName: string; middleName: string; password: string; passwordConfirmation: string };
const emptyForm: Form = { organizationId: '', employeeNumber: '', lastName: '', firstName: '', middleName: '', password: '', passwordConfirmation: '' };
const required = ['organizationId', 'employeeNumber', 'lastName', 'firstName', 'password'] as const;

function qrErrorKey(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 429) return 'identity.qr.rateLimited';
    if (error.details?.some(({ code }) => code === 'ACTIVATION_QR_EXPIRED')) return 'identity.qr.expired';
    if (error.details?.some(({ code }) => code === 'ACTIVATION_QR_INVALID')) return 'identity.qr.invalid';
  }
  return fallback;
}

/** PR 501: a person without a mailbox confirms the card data and sets the first password (`/activate`). */
export function ActivatePage() {
  const { hash } = useLocation();
  return <ActivationForm key={hash} fragment={hash} />;
}

function ActivationForm({ fragment }: { fragment: string }) {
  const { t } = useTranslation();
  const [qr] = useState(() => {
    const match = /^#qr=(personal|shared)\.([A-Za-z0-9_-]{43})$/.exec(fragment);
    if (!match) return null;
    return { kind: match[1] === 'personal' ? 'personal' as const : 'shared' as const, token: match[2]! };
  });
  const [organizationName, setOrganizationName] = useState('');
  const [linkState, setLinkState] = useState(qr ? 'loading' : fragment ? 'identity.qr.invalid' : 'ready');
  const [form, setForm] = useState<Form>(emptyForm);
  // Errors hold translation keys, so they follow the language when it is switched after an error.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!qr) return;
    const controller = new AbortController();
    void inspectActivationQr(qr, controller.signal).then(({ organizationId, organizationName }) => {
      if (controller.signal.aborted) return;
      setForm((current) => ({ ...current, organizationId }));
      setOrganizationName(organizationName);
      setLinkState('ready');
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLinkState(qrErrorKey(error, error instanceof ApiClientError && error.status === 400 ? 'identity.qr.invalid' : 'identity.qr.loadError'));
    });
    return () => controller.abort();
  }, [qr]);

  const change = (name: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (linkState !== 'ready' || isSubmitting) return;
    const next: Record<string, string> = {};
    for (const name of required) if (!form[name].trim()) next[name] = 'identity.activate.required';
    if (form.password !== form.passwordConfirmation) next.passwordConfirmation = 'identity.activate.passwordMismatch';
    setErrors(next);
    setProblems([]);
    setMessageKey(null);
    if (Object.keys(next).length) return;

    setIsSubmitting(true);
    try {
      await activateByIdentity({
        organizationId: form.organizationId.trim(), employeeNumber: form.employeeNumber.trim(), lastName: form.lastName.trim(),
        firstName: form.firstName.trim(), ...(form.middleName.trim() ? { middleName: form.middleName.trim() } : {}), password: form.password, ...(qr ? { qr } : {}),
      });
      setForm(emptyForm);
      setDone(true);
    } catch (error) {
      const violations = passwordViolationMessages(error, t);
      if (violations) setProblems(violations);
      else setMessageKey(qrErrorKey(error, error instanceof ApiClientError && error.status === 400 ? 'identity.activate.notFound' : 'identity.activate.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return <>
    <SkipLink label={t('a11y.skipToContent')} />
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-hero" aria-labelledby="activate-hero-title">
        <div className="login-hero__brand">LearnSpace</div>
        <div className="login-hero__content"><h1 id="activate-hero-title">{t('identity.activate.heroTitle')}</h1><p>{t('identity.activate.heroText')}</p></div>
        <div className="login-hero__footer">LearnSpace</div>
      </section>
      <section className="login-side">
        <LoginLanguageMenu />
        <div className="login-card">
          {done ? <div className="password-reset-status" role="status">
            <div className="password-reset-status__icon" aria-hidden="true">✓</div>
            <header className="login-header"><h2>{t('identity.activate.successTitle')}</h2><p>{t('identity.activate.success')}</p></header>
            <Link className="login-form__submit password-reset-link" to="/login">{t('identity.activate.goToLogin')}</Link>
          </div> : linkState !== 'ready' ? <>
            <header className="login-header"><h2>{t('identity.activate.title')}</h2></header>
            {linkState === 'loading' ? <p role="status">{t('identity.qr.loading')}</p> : <p role="alert">{t(linkState)}</p>}
            <Link className="password-reset-secondary" to="/login">{t('passwordReset.backToLogin')}</Link>
          </> : <>
            <header className="login-header"><h2>{t('identity.activate.title')}</h2><p>{t('identity.activate.subtitle')}</p></header>
            <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
              {qr ? <p>{organizationName}</p> : <Field id="activate-organization" label={t('identity.activate.organizationId')} error={errors.organizationId}><input id="activate-organization" autoComplete="organization" value={form.organizationId} onChange={change('organizationId')} /></Field>}
              <Field id="activate-number" label={t('identity.employeeNumber')} error={errors.employeeNumber}><input id="activate-number" autoComplete="off" value={form.employeeNumber} onChange={change('employeeNumber')} /></Field>
              <Field id="activate-lastName" label={t('identity.lastName')} error={errors.lastName}><input id="activate-lastName" autoComplete="family-name" value={form.lastName} onChange={change('lastName')} /></Field>
              <Field id="activate-firstName" label={t('identity.activate.firstName')} error={errors.firstName}><input id="activate-firstName" autoComplete="given-name" value={form.firstName} onChange={change('firstName')} /></Field>
              <label htmlFor="activate-middleName">{t('identity.activate.middleName')}<input id="activate-middleName" aria-describedby="activate-middleName-hint" autoComplete="additional-name" value={form.middleName} onChange={change('middleName')} /></label>
              <p id="activate-middleName-hint" style={{ margin: 0, fontSize: '0.85rem' }}>{t('identity.activate.middleNameHint')}</p>
              <Field id="activate-password" label={t('identity.activate.password')} error={errors.password}><PasswordInput id="activate-password" autoComplete="new-password" value={form.password} onChange={change('password')} /></Field>
              <Field id="activate-password-confirmation" label={t('identity.activate.confirmPassword')} error={errors.passwordConfirmation}><PasswordInput id="activate-password-confirmation" autoComplete="new-password" value={form.passwordConfirmation} onChange={change('passwordConfirmation')} /></Field>
              {problems.length ? <ul className="login-form__error" role="alert">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
              {messageKey ? <p className="login-form__error" role="alert">{t(messageKey)}</p> : null}
              <button className="login-form__submit" disabled={isSubmitting} type="submit">{isSubmitting ? t('identity.activate.submitting') : t('identity.activate.submit')}</button>
              <Link className="password-reset-secondary" to="/login">{t('passwordReset.backToLogin')}</Link>
            </form>
          </>}
        </div>
      </section>
    </main>
  </>;
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: ReactElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }> }) {
  const { t } = useTranslation();
  const input = cloneElement(children, { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined });
  return <><label htmlFor={id}>{label}{input}</label>{error ? <p className="login-form__field-error" id={`${id}-error`} role="alert">{t(error)}</p> : null}</>;
}
