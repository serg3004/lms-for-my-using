import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { loginResources } from '../i18n/loginResources';
import { getLoginErrorMessage } from '../shared/apiErrorFeedback';
import { ApiClientError } from '../shared/apiClient';
import { getLoginRedirectPath, LoginPage } from './LoginPage';

describe('LoginPage smoke', () => {
  it('renders the login form shell and production controls', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(html).toContain('name="organizationId"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('value="ru"');
    expect(html).toContain('value="en"');
    expect(html).toContain('value="kk"');
    expect(html).toContain('value="zh"');
    expect(html).toContain('Забыли пароль?');
    expect(html).toContain('type="submit"');
  });

  it('provides complete login copy for every supported locale', () => {
    for (const locale of ['ru', 'en', 'kk', 'zh'] as const) {
      expect(loginResources[locale].title).toBeTruthy();
      expect(loginResources[locale].rememberMe).toBeTruthy();
      expect(loginResources[locale].forgotPassword).toBeTruthy();
      expect(loginResources[locale].forgotPasswordHelp).toBeTruthy();
    }
  });

  it('maps API login errors to user-facing messages', () => {
    expect(getLoginErrorMessage(new ApiClientError('Invalid credentials', 401), (key) => key)).toBe('Invalid credentials');
  });
});

describe('getLoginRedirectPath', () => {
  it('returns /learn by default', () => {
    expect(getLoginRedirectPath(null)).toBe('/learn');
  });

  it('returns /manager/dashboard for manager-only role', () => {
    expect(getLoginRedirectPath(null, { roles: ['manager'] })).toBe('/manager/dashboard');
  });

  it('returns /learn when manager also has admin role', () => {
    expect(getLoginRedirectPath(null, { roles: ['manager', 'admin'] })).toBe('/learn');
  });

  it('returns from path when provided', () => {
    expect(getLoginRedirectPath({ from: { pathname: '/some/path' } }, { roles: ['manager'] })).toBe('/some/path');
  });

  it('returns /instructor/dashboard for instructor-only role', () => {
    expect(getLoginRedirectPath(null, { roles: ['instructor'] })).toBe('/instructor/dashboard');
  });

  it('returns /learn when instructor also has admin role', () => {
    expect(getLoginRedirectPath(null, { roles: ['instructor', 'admin'] })).toBe('/learn');
  });
});
