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

        const { [field]: _removedError, ...nextErrors } = currentErrors;

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
    <main>
      <section>
        <h1>{t('login.title')}</h1>
        <p>{t('login.subtitle')}</p>
      </section>

      <form onSubmit={handleSubmit}>
        <label>
          {t('login.organizationId')}
          <input
            aria-describedby={validationErrors.organizationId ? 'organizationId-error' : undefined}
            aria-invalid={Boolean(validationErrors.organizationId)}
            autoComplete="organization"
            name="organizationId"
            onChange={updateField('organizationId')}
            required
            type="text"
            value={formState.organizationId}
          />
        </label>
        {validationErrors.organizationId ? (
          <p id="organizationId-error" role="alert">
            {validationErrors.organizationId}
          </p>
        ) : null}

        <label>
          {t('login.email')}
          <input
            aria-describedby={validationErrors.email ? 'email-error' : undefined}
            aria-invalid={Boolean(validationErrors.email)}
            autoComplete="email"
            name="email"
            onChange={updateField('email')}
            required
            type="email"
            value={formState.email}
          />
        </label>
        {validationErrors.email ? (
          <p id="email-error" role="alert">
            {validationErrors.email}
          </p>
        ) : null}

        <label>
          {t('login.password')}
          <input
            aria-describedby={validationErrors.password ? 'password-error' : undefined}
            aria-invalid={Boolean(validationErrors.password)}
            autoComplete="current-password"
            name="password"
            onChange={updateField('password')}
            required
            type="password"
            value={formState.password}
          />
        </label>
        {validationErrors.password ? (
          <p id="password-error" role="alert">
            {validationErrors.password}
          </p>
        ) : null}

        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {isLoggedIn ? <p role="status">{t('login.success')}</p> : null}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </main>
  );
}
