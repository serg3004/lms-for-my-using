import { createApiErrorResponse } from './api-response';

describe('API response contract helpers', () => {
  it('creates the centralized API error envelope', () => {
    expect(
      createApiErrorResponse({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        path: '/api/v1/users',
        details: [
          {
            field: 'email',
            message: 'Invalid email',
            code: 'invalid_string',
          },
        ],
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          {
            field: 'email',
            message: 'Invalid email',
            code: 'invalid_string',
          },
        ],
      },
      path: '/api/v1/users',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });

  it('omits optional error details when none are provided', () => {
    expect(
      createApiErrorResponse({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Not found',
        path: '/api/v1/missing',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      statusCode: 404,
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
      },
      path: '/api/v1/missing',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });
});
