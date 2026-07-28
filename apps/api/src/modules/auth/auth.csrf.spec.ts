import { ForbiddenException } from '@nestjs/common';

import {
  accessTokenCookieName,
  assertValidCsrf,
  csrfHeaderName,
  csrfTokenCookieName,
} from './auth.cookies.js';

describe('auth CSRF hardening', () => {
  const csrfToken = 'csrf-token';
  const cookieHeader = `${accessTokenCookieName}=access-token; ${csrfTokenCookieName}=${csrfToken}`;

  it('accepts cookie-based unsafe requests with a matching CSRF token', () => {
    expect(() =>
      assertValidCsrf(
        {
          cookie: cookieHeader,
          [csrfHeaderName]: csrfToken,
        },
        'POST',
        'cookie',
      ),
    ).not.toThrow();
  });

  it('rejects cookie-based unsafe requests with a mismatched CSRF token', () => {
    expect(() =>
      assertValidCsrf(
        {
          cookie: cookieHeader,
          [csrfHeaderName]: 'different-token',
        },
        'POST',
        'cookie',
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not require CSRF for cookie-based safe requests', () => {
    expect(() => assertValidCsrf({ cookie: cookieHeader }, 'GET', 'cookie')).not.toThrow();
  });

  it('does not require CSRF for bearer-authenticated unsafe requests', () => {
    expect(() => assertValidCsrf({}, 'POST', 'bearer')).not.toThrow();
  });
});
