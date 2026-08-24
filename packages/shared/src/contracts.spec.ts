import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './constants/locales.js';
import { USER_ROLES, userRoleSchema, type UserRole } from './constants/roles.js';
import { paginationQuerySchema, type PaginationQuery } from './schemas/pagination.schema.js';
import {
  API_ERROR_CODES,
  apiErrorCodeSchema,
  apiErrorResponseSchema,
  paginatedResponseSchema,
  type ApiErrorResponse,
  type PaginatedResponse,
} from './types/api.js';

describe('pagination contract', () => {
  it('applies defaults and coerces query string values', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({ page: 2, pageSize: 50 });
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 101 },
  ])('rejects invalid pagination values: %o', (query) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false);
  });

  it('keeps the inferred DTO in sync with the schema', () => {
    expectTypeOf(paginationQuerySchema.parse({})).toEqualTypeOf<PaginationQuery>();
  });
});

describe('role and locale contracts', () => {
  it('accepts every supported role and rejects unknown roles', () => {
    expect(userRoleSchema.options).toEqual(USER_ROLES);
    for (const role of USER_ROLES) expect(userRoleSchema.parse(role)).toBe(role);
    expect(userRoleSchema.safeParse('owner').success).toBe(false);
    expectTypeOf<UserRole>().toEqualTypeOf<(typeof USER_ROLES)[number]>();
  });

  it('keeps the default locale in the supported locale list', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ru', 'en', 'kk', 'zh']);
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expectTypeOf<SupportedLocale>().toEqualTypeOf<(typeof SUPPORTED_LOCALES)[number]>();
  });
});

describe('API response contracts', () => {
  const errorResponse = {
    statusCode: 422,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ field: 'email', message: 'Invalid email', code: 'invalid_string' }],
    },
    path: '/api/users',
    timestamp: '2026-08-09T12:00:00.000Z',
  } satisfies ApiErrorResponse;

  it('validates the normalized API error DTO', () => {
    expect(apiErrorResponseSchema.parse(errorResponse)).toEqual(errorResponse);
    expect(apiErrorResponseSchema.safeParse({ ...errorResponse, statusCode: '422' }).success).toBe(false);
    expect(apiErrorResponseSchema.safeParse({ ...errorResponse, requestId: 'extra' }).success).toBe(false);
    expectTypeOf(apiErrorResponseSchema.parse(errorResponse)).toEqualTypeOf<ApiErrorResponse>();
  });

  it('exposes stable, typed error codes and rejects unknown codes', () => {
    expect(apiErrorCodeSchema.options).toEqual(API_ERROR_CODES);
    expect(apiErrorCodeSchema.parse('AUTH_INVALID_CREDENTIALS')).toBe('AUTH_INVALID_CREDENTIALS');
    expect(apiErrorCodeSchema.safeParse('BACKEND_PROSE_AS_CODE').success).toBe(false);
  });

  it('validates paginated DTOs with their item contract', () => {
    const schema = paginatedResponseSchema(z.object({ id: z.string().uuid(), title: z.string() }).strict());
    const response = {
      items: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Course' }],
      page: 1,
      pageSize: 20,
      total: 1,
    } satisfies PaginatedResponse<{ id: string; title: string }>;

    expect(schema.parse(response)).toEqual(response);
    expect(schema.safeParse({ ...response, total: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...response, items: [{ id: 'invalid', title: 'Course' }] }).success).toBe(false);
    expectTypeOf(schema.parse(response)).toEqualTypeOf<PaginatedResponse<{ id: string; title: string }>>();
  });
});
