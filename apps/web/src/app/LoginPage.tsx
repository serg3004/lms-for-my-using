import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { login } from '../shared/api/auth.js';
import { getLoginErrorMessage } from '../shared/apiErrorFeedback.js';
import { hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';

type LoginFormState = {
  organizationId: string;
  email: string;
  password: string;
};

type LoginFormField = keyof LoginFormState;
type LoginLocale = 'ru' | 'en' | 'kk' | 'zh';

type LoginLocationState = {
  from?: {
    pathname?: unknown;
  };
};

const REMEMBERED_LOGIN_KEY = 'lms-remembered-login';
const LANGUAGE_KEY = 'lms-prototype-language';
const SUPPORTED_LOCALES: LoginLocale[] = ['ru', 'en', 'kk', 'zh'];

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
  };
}

export function getLoginRedirectPath(locationState: unknown, user?: { roles: string[] }) {
  const fromPath = (locationState as LoginLocationState | null)?.from?.pathname;
  if (typeof fromPath === 'string' && fromPath.startsWith('/') && !fromPath.startsWith('//')) {
    return fromPath;
  }
  if (user?.roles.includes('instructor') && !user.roles.includes('admin')) {
    return '/instructor/dashboard';
  }
  if (user?.roles.includes('manager') && !user.roles.includes('admin') && !user.roles.includes('instructor')) {
    return '/manager/dashboard';
  }
  return '/learn';
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [formState, setFormState] = useState(getInitialLoginFormState);
  const [validationErrors, setValidationErrors] = useState<FormValidationErrors<LoginFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberedLogin() !== null);

  useEffect(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    if (storedLanguage && SUPPORTED_LOCALES.includes(storedLanguage as LoginLocale)) {
      void i18n.changeLanguage(storedLanguage);
    }
  }, [i18n]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setIsLoggedIn(false);

    const nextValidationErrors = validateRequiredFields<LoginFormField>([
      { name: 'organizationId', value: formState.organizationId, message: t('validation.required') },
      { name: 'email', value: formState.email, message: t('validation.required') },
      { name: 'password', value: formState.password, message: t('validation.required') },
    ]);

    setValidationErrors(nextValidationErrors);
    if (hasValidationErrors(nextValidationErrors)) return;

    setIsSubmitting(true);

    try {
      const loginResult = await login({
        organizationId: formState.organizationId.trim(),
        email: formState.email.trim(),
        password: formState.password,
      });

      if (rememberMe) {
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
      navigate(getLoginRedirectPath(location.state, loginResult.user), { replace: true });
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const locale = event.target.value as LoginLocale;
    localStorage.setItem(LANGUAGE_KEY, locale);
    void i18n.changeLanguage(locale);
  }

  return (
    <main className="login-page">
      <section className="login-hero" aria-labelledby="login-hero-title">
        <div className="login-hero__brand">
          <span className="login-hero__mark" aria-hidden="true">L</span>
          <span>
            <strong>LearnSpace</strong>
            <small>{t('login.brandSubtitle')}</small>
          </span>
        </div>

        <div className="login-hero__content">
          <span className="login-hero__eyebrow">LearnSpace LMS</span>
          <h1 id="login-hero-title">{t('login.heroTitle')}</h1>
          <p>{t('login.heroText')}</p>
        </div>

        <div className="login-hero__benefits">
          <span>{t('login.benefitCourses')}</span>
          <span>{t('login.benefitAssessments')}</span>
          <span>{t('login.benefitProgress')}</span>
        </div>
      </section>

      <section className="login-side">
        <label className="login-language">
          <span className="sr-only">{t('login.language')}</span>
          <select
            aria-label={t('login.language')}
            onChange={handleLanguageChange}
            value={(i18n.resolvedLanguage ?? i18n.language).split('-')[0]}
          >
            <option value="ru">RU</option>
            <option value="en">EN</option>
            <option value="kk">KK</option>
            <option value="zh">ZH</option>
          </select>
        </label>

        <div className="login-card">
          <header className="login-header">
            <h2>{t('login.title')}</h2>
            <p>{t('login.subtitle')}</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="organizationId">
              {t('login.organizationId')}
              <input
                aria-describedby={validationErrors.organizationId ? 'organizationId-error' : undefined}
                aria-invalid={Boolean(validationErrors.organizationId)}
                autoComplete="organization"
                id="organizationId"
                name="organizationId"
                onChange={updateField('organizationId')}
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

            <label htmlFor="email">
              {t('login.email')}
              <input
                aria-describedby={validationErrors.email ? 'email-error' : undefined}
                aria-invalid={Boolean(validationErrors.email)}
                autoComplete="email"
                id="email"
                name="email"
                onChange={updateField('email')}
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
                  {showPassword ? '🙈' : '👁'}
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
              <button
                className="login-form__forgot"
                onClick={() => {
                  setErrorMessage(null);
                  setInfoMessage(t('login.forgotPasswordHelp'));
                }}
                type="button"
              >
                {t('login.forgotPassword')}
              </button>
            </div>

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
    </main>
  );
}
