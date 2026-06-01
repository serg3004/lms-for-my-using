import { describe, expect, it } from 'vitest';

import { getLoginRedirectPath } from './LoginPage';

describe('getLoginRedirectPath', () => {
  it('returns protected route pathname from location state', () => {
    expect(getLoginRedirectPath({ from: { pathname: '/admin/users' } })).toBe('/admin/users');
  });

  it('falls back to learner home when location state is missing', () => {
    expect(getLoginRedirectPath(null)).toBe('/learn');
  });

  it('rejects non-internal redirect paths', () => {
    expect(getLoginRedirectPath({ from: { pathname: '//evil.example/path' } })).toBe('/learn');
  });
});
