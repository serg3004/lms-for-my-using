import { ChangeEvent, FormEvent, useState } from 'react';
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

type LoginLocationState = {
  from?: {
    pathname?: unknown;
  };
};

const initialLoginFormState: LoginFormState = {
  organizationId: '',
  email: '',
  password: '',
};

export function getLoginRedirectPath(locationState: unknown) {
  const fromPath = (locationState as LoginLocationState | null)?.from?.pathname;

  return typeof fromPath === 'string' && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/learn';
}

export function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [formState, setFormState] = useState(initialLoginFormState);
  const [validationErrors, setValidationErrors] = useState<FormValidationErrors<LoginFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const updateField =
    (field: keyof LoginFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((currentFormState) => ({
        ...currentFormState,
        [field]: event.target.value,
      }));
      setValidationErrors((currentErrors) => {
        if (!currentErrors[field]) {
          return currentErrors;
        }

        const nextErrors = { ...currentErrors };
        delete nextErrors[field];

        return nextErrors;
      });
    };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoggedIn(false);

    const nextValidationErrors = validateRequiredFields<LoginFormField>([
      { name: 'organizationId', value: formState.organizationId, message: t('validation.required') },
      { name: 'email', value: formState.email, message: t('validation.required') },
      { name: 'password', value: formState.password, message: t('validation.required') },
    ]);

    setValidationErrors(nextValidationErrors);

    if (hasValidationErrors(nextValidationErrors)) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({
        organizationId: formState.organizationId.trim(),
        email: formState.email.trim(),
        password: formState.password,
      });
      setIsLoggedIn(true);
      setFormState((currentFormState) => ({
        ...currentFormState,
        password: '',
      }));
      navigate(getLoginRedirectPath(location.state), { replace: true });
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <header className="login-header">
          <h1>{t('login.title')}</h1>
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
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={0}
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
    </main>
  );
}
