import { describe, expect, it } from 'vitest';

import { getLoginRedirectPath } from './LoginPage';

describe('getLoginRedirectPath', () => {
  it('returns protected route pathname from location state', () => {
    expect(getLoginRedirectPath({ from: { pathname: '/admin/users' } })).toBe('/admin/users');
  });

  it('keeps the query of the assessment link after login', () => {
    expect(getLoginRedirectPath({ from: { pathname: '/learn/assessments/test/take', search: '?token=link' } }))
      .toBe('/learn/assessments/test/take?token=link');
  });

  it('falls back to learner home when location state is missing', () => {
    expect(getLoginRedirectPath(null)).toBe('/learn');
  });

  it('rejects non-internal redirect paths', () => {
    expect(getLoginRedirectPath({ from: { pathname: '//evil.example/path' } })).toBe('/learn');
  });

  it('redirects administrators to the admin workspace', () => {
    expect(getLoginRedirectPath(null, { roles: ['admin'] })).toBe('/admin');
  });
});
