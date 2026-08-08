import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './constants/locales.js';
import { USER_ROLES, userRoleSchema, type UserRole } from './constants/roles.js';
import { PAGINATION_DEFAULTS, paginationQuerySchema, type PaginationQuery } from './schemas/pagination.schema.js';
import type { ApiErrorResponse, PaginatedResponse } from './types/api.js';

describe('role contract', () => {
  it('keeps the canonical role list and runtime schema synchronized', () => {
    expect(USER_ROLES).toEqual(['learner', 'instructor', 'manager', 'admin']);
    expect(new Set(USER_ROLES).size).toBe(USER_ROLES.length);

    for (const role of USER_ROLES) {
      expect(userRoleSchema.parse(role)).toBe(role);
    }
    expect(userRoleSchema.safeParse('owner').success).toBe(false);
    expectTypeOf<UserRole>().toEqualTypeOf<(typeof USER_ROLES)[number]>();
  });
});

describe('locale contract', () => {
  it('keeps supported locales unique and includes the default locale', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ru', 'en', 'kk', 'zh']);
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length);
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expectTypeOf<SupportedLocale>().toEqualTypeOf<(typeof SUPPORTED_LOCALES)[number]>();
  });
});

describe('pagination contract', () => {
  it('applies defaults and coerces query-string values', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: PAGINATION_DEFAULTS.page,
      pageSize: PAGINATION_DEFAULTS.pageSize,
    });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '200' })).toEqual({ page: 2, pageSize: 200 });
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: PAGINATION_DEFAULTS.maxPageSize + 1 },
    { pageSize: 'not-a-number' },
  ])('rejects invalid pagination input: %j', (query) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false);
  });

  it('publishes the inferred DTO shape', () => {
    expectTypeOf<PaginationQuery>().toEqualTypeOf<{ page: number; pageSize: number }>();
  });
});

describe('API DTO contracts', () => {
  it('accepts the documented error envelope and paginated response', () => {
    const response = {
      statusCode: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'email', message: 'Invalid email', code: 'invalid_format' }],
      },
      path: '/api/v1/users',
      timestamp: '2026-08-08T00:00:00.000Z',
    } satisfies ApiErrorResponse;
    const page = { items: [{ id: 'user-1' }], page: 1, pageSize: 20, total: 1 } satisfies PaginatedResponse<{
      id: string;
    }>;

    expect(response.error.details?.[0]?.field).toBe('email');
    expect(page.items).toHaveLength(1);
    expectTypeOf(page).toMatchTypeOf<PaginatedResponse<{ id: string }>>();
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [target] : [];
    }),
  );
  return nested.flat();
}

describe('shared package boundary', () => {
  it('does not depend on application code or contain internal import cycles', async () => {
    const sourceRoot = path.resolve(import.meta.dirname);
    const files = await sourceFiles(sourceRoot);
    const graph = new Map<string, string[]>();

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      expect(imports.filter((specifier) => specifier.includes('/apps/') || specifier.startsWith('apps/'))).toEqual([]);
      graph.set(
        file,
        imports
          .filter((specifier) => specifier.startsWith('.'))
          .map((specifier) => path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')))
          .filter((target) => files.includes(target)),
      );
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (file: string): void => {
      if (visiting.has(file)) throw new Error(`Circular shared import detected at ${path.relative(sourceRoot, file)}`);
      if (visited.has(file)) return;
      visiting.add(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      visiting.delete(file);
      visited.add(file);
    };
    for (const file of files) visit(file);

    expect(visited.size).toBe(files.length);
  });
});
