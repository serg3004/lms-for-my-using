import { describe, expect, it } from 'vitest';

import { ApiClientError } from './apiClient';
import { getLoginErrorMessage } from './apiErrorFeedback';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

describe('getLoginErrorMessage', () => {
  it('returns rate limit feedback for normalized 429 errors', () => {
    const error = new ApiClientError('Too many requests', 429, {
      statusCode: 429,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests',
      },
      path: '/api/v1/auth/login',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(getLoginErrorMessage(error, t)).toBe('login.errors.tooManyRequests:Too many attempts. Please wait and try again.');
  });

  it('returns API error messages for non-rate-limit API errors', () => {
    const error = new ApiClientError('Invalid credentials', 401);

    expect(getLoginErrorMessage(error, t)).toBe('Invalid credentials');
  });

  it('returns generic login feedback for unknown errors', () => {
    expect(getLoginErrorMessage(new Error('network down'), t)).toBe('login.errors.generic:Login failed');
  });
});
