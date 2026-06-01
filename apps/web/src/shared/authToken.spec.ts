import { describe, expect, it } from 'vitest';

import { clearAuthToken, getAuthToken, setAuthToken } from './authToken.js';

describe('authToken compatibility', () => {
  it('does not block cookie-authenticated pages with a missing frontend token', () => {
    expect(getAuthToken()).toBe('cookie-auth');
  });

  it('keeps legacy token mutators as no-ops', () => {
    expect(() => setAuthToken(null)).not.toThrow();
    expect(() => clearAuthToken()).not.toThrow();
    expect(getAuthToken()).toBe('cookie-auth');
  });
});
