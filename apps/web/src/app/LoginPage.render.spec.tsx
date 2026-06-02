import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { getLoginErrorMessage } from '../shared/apiErrorFeedback';
import { ApiClientError } from '../shared/apiClient';
import { LoginPage } from './LoginPage';

describe('LoginPage smoke', () => {
  it('renders the login form shell', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(html).toContain('name="organizationId"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('type="submit"');
  });

  it('maps API login errors to user-facing messages', () => {
    expect(getLoginErrorMessage(new ApiClientError('Invalid credentials', 401), (key) => key)).toBe('Invalid credentials');
  });
});
