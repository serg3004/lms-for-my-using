import { assertSafeTestDatabase } from './database-test-safety.js';

describe('database integration test safety', () => {
  it.each([
    'postgresql://postgres:postgres@127.0.0.1:55432/lms_test',
    'postgres://postgres:postgres@localhost:5432/lms_integration_test?schema=public',
  ])('accepts a local test database URL', (databaseUrl) => {
    expect(assertSafeTestDatabase(databaseUrl)).toBe(databaseUrl);
  });

  it('does not include credentials when reporting an invalid target', () => {
    const databaseUrl = 'postgresql://secret-user:secret-password@db.example.com/lms';

    expect(() => assertSafeTestDatabase(databaseUrl)).toThrow('database name containing "test"');

    try {
      assertSafeTestDatabase(databaseUrl);
    } catch (error) {
      expect(String(error)).not.toContain('secret-user');
      expect(String(error)).not.toContain('secret-password');
    }
  });

  it.each([
    undefined,
    'not-a-url',
    'mysql://root:root@localhost/lms_test',
    'postgresql://postgres:postgres@localhost/lms',
    'postgresql://postgres:postgres@localhost/lms_production_test',
    'postgresql://postgres:postgres@staging-db.internal/lms_test',
    'postgresql://postgres:postgres@railway.example/lms_test',
    'postgresql://postgres:postgres@db.example.com/lms_test',
  ])('rejects an unsafe database URL without echoing it: %s', (databaseUrl) => {
    expect(() => assertSafeTestDatabase(databaseUrl)).toThrow();
  });

  it('allows an explicitly opted-in external test host while still rejecting production markers', () => {
    const externalTestUrl = 'postgresql://postgres:postgres@ci-db.internal/lms_test';

    expect(assertSafeTestDatabase(externalTestUrl, { allowExternalHost: true })).toBe(externalTestUrl);
    expect(() =>
      assertSafeTestDatabase('postgresql://postgres:postgres@production-db.internal/lms_test', {
        allowExternalHost: true,
      }),
    ).toThrow('refuses a production or staging target');
  });
});
