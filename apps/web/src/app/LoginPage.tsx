import { useOptionalSession } from '../shared/session.js';
import { ChangeEvent, FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { login } from '../shared/api/auth.js';
import { getLoginErrorMessage } from '../shared/apiErrorFeedback.js';
import { hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { LoginLanguageMenu } from '../shared/LoginLanguageMenu.js';
import { SkipLink } from '../shared/ui.js';
import { AuthorshipNote } from '../shared/AuthorshipNote.js';
import { QrLoginPanel } from '../features/qr-login/QrLoginPanel.js';

type LoginFormState = {
  organizationId: string;
  email: string;
  password: string;
  /** PR 501: sign-in without email. */
  employeeNumber: string;
  lastName: string;
};

type LoginFormField = keyof LoginFormState;

type LoginLocationState = {
  from?: {
    pathname?: unknown;
    search?: unknown;
  };
};

const REMEMBERED_LOGIN_KEY = 'lms-remembered-login';

function getRememberedLogin(): Pick<LoginFormState, 'organizationId' | 'email'> | null {
  try {
    const storedValue = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (!storedValue) return null;

    const parsedValue = JSON.parse(storedValue) as Partial<LoginFormState>;
    if (typeof parsedValue.organizationId !== 'string' || typeof parsedValue.email !== 'string') return null;

    return {
      organizationId: parsedValue.organizationId,
      email: parsedValue.email,
    };
  } catch {
    return null;
  }
}

function getInitialLoginFormState(): LoginFormState {
  const rememberedLogin = getRememberedLogin();

  return {
    organizationId: rememberedLogin?.organizationId ?? '',
    email: rememberedLogin?.email ?? '',
    password: '',
    employeeNumber: '',
    lastName: '',
  };
}

export function getLoginRedirectPath(locationState: unknown, user?: { roles: string[]; inspector?: unknown }) {
  // PR 507: an outside inspector has only the employee card.
  if (user?.inspector) return '/employee-card';
  const from = (locationState as LoginLocationState | null)?.from;
  const fromPath = from?.pathname;
  if (typeof fromPath === 'string' && fromPath.startsWith('/') && !fromPath.startsWith('//')) {
    const search = typeof from?.search === 'string' && from.search.startsWith('?') ? from.search : '';
    return fromPath + search;
  }

  if (user?.roles.includes('admin')) {
    return '/admin';
  }

  if (user?.roles.includes('instructor') && !user.roles.includes('admin')) {
    return '/instructor/dashboard';
  }

  if (user?.roles.includes('manager') && !user.roles.includes('admin') && !user.roles.includes('instructor')) {
    return '/manager/dashboard';
  }

  if (
    user?.roles.includes('mentor') &&
    !user.roles.includes('admin') &&
    !user.roles.includes('instructor') &&
    !user.roles.includes('manager')
  ) {
    return '/mentor';
  }

  return '/learn';
}

export function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useOptionalSession();
  function finishSignIn(user: Parameters<typeof getLoginRedirectPath>[1]) {
    session?.clearSession();
    navigate(getLoginRedirectPath(location.state, user), { replace: true });
  }
  const [formState, setFormState] = useState(getInitialLoginFormState);
  const [validationErrors, setValidationErrors] = useState<FormValidationErrors<LoginFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberedLogin() !== null);
  const [byNumber, setByNumber] = useState(false);
  /** PR 505: the third way, a QR confirmed on a phone. */
  const [byQr, setByQr] = useState(false);

  const updateField =
    (field: LoginFormField) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((currentFormState) => ({
        ...currentFormState,
        [field]: event.target.value,
      }));
      setValidationErrors((currentErrors) => {
        if (!currentErrors[field]) return currentErrors;

        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
    };

  const active = (method: 'email' | 'number' | 'qr') => (method === 'qr' ? byQr : method === 'number' ? byNumber && !byQr : !byNumber && !byQr);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setIsLoggedIn(false);

    const nextValidationErrors = validateRequiredFields<LoginFormField>([
      { name: 'organizationId', value: formState.organizationId, message: t('validation.required') },
      ...(byNumber
        ? [
            { name: 'employeeNumber' as const, value: formState.employeeNumber, message: t('validation.required') },
            { name: 'lastName' as const, value: formState.lastName, message: t('validation.required') },
          ]
        : [{ name: 'email' as const, value: formState.email, message: t('validation.required') }]),
      { name: 'password', value: formState.password, message: t('validation.required') },
    ]);

    setValidationErrors(nextValidationErrors);
    if (hasValidationErrors(nextValidationErrors)) return;

    setIsSubmitting(true);

    try {
      const loginResult = await login(byNumber
        ? {
            organizationId: formState.organizationId.trim(),
            employeeNumber: formState.employeeNumber.trim(),
            lastName: formState.lastName.trim(),
            password: formState.password,
          }
        : {
            organizationId: formState.organizationId.trim(),
            email: formState.email.trim(),
            password: formState.password,
          });

      if (byNumber) {
        // Nothing but the organization is remembered for this way: the number and the name identify a person.
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      } else if (rememberMe) {
        localStorage.setItem(
          REMEMBERED_LOGIN_KEY,
          JSON.stringify({
            organizationId: formState.organizationId.trim(),
            email: formState.email.trim(),
          }),
        );
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      }

      setIsLoggedIn(true);
      setFormState((currentFormState) => ({
        ...currentFormState,
        password: '',
      }));
      finishSignIn(loginResult.user);
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <SkipLink label={t('a11y.skipToContent')} />
      <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-hero" aria-labelledby="login-hero-title">
        <div className="login-hero__brand">LearnSpace</div>

        <div className="login-hero__content">
          <h1 id="login-hero-title">{t('login.heroTitle')}</h1>
          <p>{t('login.heroText')}</p>
        </div>

        <div className="login-hero__footer">{t('login.footer')}</div>
      </section>

      <section className="login-side">
        <LoginLanguageMenu />

        <div className="login-card">
          <header className="login-header">
            <h2>{t('login.title')}</h2>
            <p>{t('login.subtitle')}</p>
          </header>

          <div aria-label={t('identity.loginTabs')} role="group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(['email', 'number', 'qr'] as const).map((method) => (
              <button
                aria-pressed={active(method)}
                className="password-reset-secondary"
                key={method}
                onClick={() => { setByQr(method === 'qr'); setByNumber(method === 'number'); setValidationErrors({}); setErrorMessage(null); }}
                style={{ flex: 1, minHeight: '2.5rem', cursor: 'pointer', fontWeight: active(method) ? 700 : 400, border: `${active(method) ? 2 : 1}px solid currentColor`, borderRadius: '0.5rem', background: 'transparent', color: 'inherit' }}
                type="button"
              >
                {method === 'qr' ? t('qrLogin.tab') : method === 'number' ? t('identity.tabNumber') : t('identity.tabEmail')}
              </button>
            ))}
          </div>

          {byQr ? <QrLoginPanel onSignedIn={finishSignIn} /> : null}

          <form className="login-form" style={byQr ? { display: "none" } : undefined} onSubmit={handleSubmit}>
            <label htmlFor="organizationId">
              {t('login.organizationId')}
              <input
                aria-describedby={validationErrors.organizationId ? 'organizationId-error' : undefined}
                aria-invalid={Boolean(validationErrors.organizationId)}
                autoComplete="organization"
                id="organizationId"
                name="organizationId"
                onChange={updateField('organizationId')}
                placeholder={t('login.organizationIdPlaceholder')}
                required
                type="text"
                value={formState.organizationId}
              />
            </label>
            {validationErrors.organizationId ? (
              <p className="login-form__field-error" id="organizationId-error" role="alert">
                {validationErrors.organizationId}
              </p>
            ) : null}

            {byNumber ? (
              <>
                <label htmlFor="employeeNumber">
                  {t('identity.employeeNumber')}
                  <input
                    aria-describedby={validationErrors.employeeNumber ? 'employeeNumber-error' : 'login-number-hint'}
                    aria-invalid={Boolean(validationErrors.employeeNumber)}
                    autoComplete="off"
                    id="employeeNumber"
                    name="employeeNumber"
                    onChange={updateField('employeeNumber')}
                    placeholder={t('identity.employeeNumberPlaceholder')}
                    required
                    type="text"
                    value={formState.employeeNumber}
                  />
                </label>
                {validationErrors.employeeNumber ? (
                  <p className="login-form__field-error" id="employeeNumber-error" role="alert">
                    {validationErrors.employeeNumber}
                  </p>
                ) : null}

                <label htmlFor="lastName">
                  {t('identity.lastName')}
                  <input
                    aria-describedby={validationErrors.lastName ? 'lastName-error' : 'login-number-hint'}
                    aria-invalid={Boolean(validationErrors.lastName)}
                    autoComplete="family-name"
                    id="lastName"
                    name="lastName"
                    onChange={updateField('lastName')}
                    placeholder={t('identity.lastNamePlaceholder')}
                    required
                    type="text"
                    value={formState.lastName}
                  />
                </label>
                {validationErrors.lastName ? (
                  <p className="login-form__field-error" id="lastName-error" role="alert">
                    {validationErrors.lastName}
                  </p>
                ) : null}
                <p id="login-number-hint" style={{ margin: 0, fontSize: '0.85rem' }}>{t('identity.numberHint')}</p>
              </>
            ) : (
              <>
                <label htmlFor="email">
                  {t('login.email')}
                  <input
                    aria-describedby={validationErrors.email ? 'email-error' : undefined}
                    aria-invalid={Boolean(validationErrors.email)}
                    autoComplete="email"
                    id="email"
                    name="email"
                    onChange={updateField('email')}
                    placeholder={t('login.emailPlaceholder')}
                    required
                    type="email"
                    value={formState.email}
                  />
                </label>
                {validationErrors.email ? (
                  <p className="login-form__field-error" id="email-error" role="alert">
                    {validationErrors.email}
                  </p>
                ) : null}
              </>
            )}

            <label htmlFor="password">
              {t('login.password')}
              <div className="login-form__password-wrapper">
                <input
                  aria-describedby={validationErrors.password ? 'password-error' : undefined}
                  aria-invalid={Boolean(validationErrors.password)}
                  autoComplete="current-password"
                  id="password"
                  name="password"
                  onChange={updateField('password')}
                  placeholder={t('login.passwordPlaceholder')}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={formState.password}
                />
                <button
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="login-form__toggle-password"
                  onClick={() => setShowPassword((previousValue) => !previousValue)}
                  type="button"
                >
                  {showPassword ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.7 10.7 0 0112 4c5.2 0 8.8 4.5 9.7 6a1.8 1.8 0 010 2 16.6 16.6 0 01-3.1 3.6M6.2 6.2A16.3 16.3 0 002.3 10a1.8 1.8 0 000 2c.9 1.5 4.5 6 9.7 6 1.2 0 2.3-.2 3.3-.6" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M2.3 10a1.8 1.8 0 000 2c.9 1.5 4.5 6 9.7 6s8.8-4.5 9.7-6a1.8 1.8 0 000-2C20.8 8.5 17.2 4 12 4S3.2 8.5 2.3 10z" />
                      <circle cx="12" cy="11" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {validationErrors.password ? (
              <p className="login-form__field-error" id="password-error" role="alert">
                {validationErrors.password}
              </p>
            ) : null}

            <div className="login-form__options">
              <label className="login-form__remember">
                <input
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <span>{t('login.rememberMe')}</span>
              </label>
              <Link
                className="login-form__forgot"
                to="/password-reset"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>
            <Link className="login-form__forgot" to="/activate">{t('identity.activateLink')}</Link>
            <Link className="login-form__forgot" to="/badge">{t('badge.link')}</Link>

            {infoMessage ? (
              <p className="login-form__info" role="status">
                {infoMessage}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="login-form__error" role="alert">
                {errorMessage}
              </p>
            ) : null}
            {isLoggedIn ? (
              <p className="login-form__success" role="status">
                {t('login.success')}
              </p>
            ) : null}

            <button className="login-form__submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </section>
      <AuthorshipNote />
      </main>
    </>
  );
}
