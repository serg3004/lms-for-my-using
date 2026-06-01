import { ChangeEvent, FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ApiClientError, login } from '../shared/apiClient.js';

type LoginFormState = {
  organizationId: string;
  email: string;
  password: string;
};

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
    };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoggedIn(false);
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
      const message =
        error instanceof ApiClientError ? error.message : t('login.errors.generic');
      setErrorMessage(message);
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
            autoComplete="organization"
            name="organizationId"
            onChange={updateField('organizationId')}
            required
            type="text"
            value={formState.organizationId}
          />
        </label>

        <label>
          {t('login.email')}
          <input
            autoComplete="email"
            name="email"
            onChange={updateField('email')}
            required
            type="email"
            value={formState.email}
          />
        </label>

        <label>
          {t('login.password')}
          <input
            autoComplete="current-password"
            name="password"
            onChange={updateField('password')}
            required
            type="password"
            value={formState.password}
          />
        </label>

        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {isLoggedIn ? <p role="status">{t('login.success')}</p> : null}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </main>
  );
}
