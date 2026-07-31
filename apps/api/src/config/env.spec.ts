import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { getJwtSecret, loadApiEnv, loadLocalEnvFiles, parseTrustProxy } from './env';

const validJwtSecret = '0123456789abcdef0123456789abcdef';
const validDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/lms';

function createTempEnvDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'lms-api-env-'));
}

describe('API environment validation', () => {
  it('loads a valid API environment', () => {
    const apiEnv = loadApiEnv({
      NODE_ENV: 'production',
      DATABASE_URL: validDatabaseUrl,
      API_PORT: '3001',
      FRONTEND_URL: 'http://localhost:5173',
      JWT_SECRET: validJwtSecret,
      TRUST_PROXY: 'loopback,linklocal,uniquelocal',
      REDIS_URL: 'redis://localhost:6379',
    });

    expect(apiEnv).toEqual({
      NODE_ENV: 'production',
      DATABASE_URL: validDatabaseUrl,
      API_PORT: 3001,
      FRONTEND_URL: 'http://localhost:5173',
      JWT_SECRET: validJwtSecret,
      LOG_LEVEL: 'info',
      REDIS_URL: 'redis://localhost:6379',
      RATE_LIMIT_NAMESPACE: 'lms',
      TRUST_PROXY: ['loopback', 'linklocal', 'uniquelocal'],
    });
  });

  it('uses default frontend URL for local development', () => {
    const apiEnv = loadApiEnv({
      DATABASE_URL: validDatabaseUrl,
      JWT_SECRET: validJwtSecret,
    });

    expect(apiEnv.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('defaults NODE_ENV to development when not set', () => {
    const apiEnv = loadApiEnv({
      DATABASE_URL: validDatabaseUrl,
      JWT_SECRET: validJwtSecret,
    });

    expect(apiEnv.NODE_ENV).toBe('development');
  });

  it('accepts all valid NODE_ENV values', () => {
    for (const nodeEnv of ['development', 'production', 'test'] as const) {
      const apiEnv = loadApiEnv({
        NODE_ENV: nodeEnv,
        DATABASE_URL: validDatabaseUrl,
        JWT_SECRET: validJwtSecret,
        ...(nodeEnv === 'production' ? { TRUST_PROXY: '1', REDIS_URL: 'redis://localhost:6379' } : {}),
      });
      expect(apiEnv.NODE_ENV).toBe(nodeEnv);
    }
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'staging',
        DATABASE_URL: validDatabaseUrl,
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/NODE_ENV/);
  });

  it('requires an explicit trusted proxy policy in production', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDatabaseUrl,
        JWT_SECRET: validJwtSecret,
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow(/TRUST_PROXY.*required in production/);
  });

  it('requires Redis in production', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        DATABASE_URL: validDatabaseUrl,
        JWT_SECRET: validJwtSecret,
        TRUST_PROXY: '1',
      }),
    ).toThrow(/REDIS_URL.*required in production/);
  });

  it('allows an explicit emergency in-memory override in production', () => {
    const apiEnv = loadApiEnv({
      NODE_ENV: 'production',
      DATABASE_URL: validDatabaseUrl,
      JWT_SECRET: validJwtSecret,
      TRUST_PROXY: '1',
      ALLOW_IN_MEMORY_RATE_LIMIT: 'true',
      RATE_LIMIT_NAMESPACE: 'emergency-prod',
    });

    expect(apiEnv.REDIS_URL).toBeUndefined();
    expect(apiEnv.ALLOW_IN_MEMORY_RATE_LIMIT).toBe('true');
    expect(apiEnv.RATE_LIMIT_NAMESPACE).toBe('emergency-prod');
  });

  it('parses disabled, hop-count, IPv4, IPv6, and named proxy policies', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('127.0.0.1/32, 2001:db8::/32, loopback')).toEqual([
      '127.0.0.1/32',
      '2001:db8::/32',
      'loopback',
    ]);
  });

  it.each(['true', '999.1.1.1', '10.0.0.0/33', '2001:db8::/129', 'loopback,all'])(
    'rejects invalid trusted proxy policy %s',
    (value) => {
      expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY/);
    },
  );

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      loadApiEnv({
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid DATABASE_URL', () => {
    expect(() =>
      loadApiEnv({
        DATABASE_URL: 'not-a-url',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('loads local env files without overriding already configured values', () => {
    const cwd = createTempEnvDirectory();
    const env: Record<string, string | undefined> = {
      API_PORT: '4000',
    };

    try {
      writeFileSync(
        join(cwd, '.env'),
        ['API_PORT=3000', 'FRONTEND_URL=http://localhost:5173', `JWT_SECRET=${validJwtSecret}`, `DATABASE_URL=${validDatabaseUrl}`].join('\n'),
      );
      writeFileSync(join(cwd, '.env.local'), 'API_PORT=5000\n');

      expect(loadLocalEnvFiles({ cwd, env })).toEqual(['.env', '.env.local']);
      expect(env).toEqual({
        API_PORT: '4000',
        DATABASE_URL: validDatabaseUrl,
        FRONTEND_URL: 'http://localhost:5173',
        JWT_SECRET: validJwtSecret,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not load local env files in production or CI', () => {
    const cwd = createTempEnvDirectory();

    try {
      writeFileSync(join(cwd, '.env'), `JWT_SECRET=${validJwtSecret}`);

      const productionEnv: Record<string, string | undefined> = { NODE_ENV: 'production' };
      const ciEnv: Record<string, string | undefined> = { CI: 'true' };

      expect(loadLocalEnvFiles({ cwd, env: productionEnv })).toEqual([]);
      expect(loadLocalEnvFiles({ cwd, env: ciEnv })).toEqual([]);
      expect(productionEnv).toEqual({ NODE_ENV: 'production' });
      expect(ciEnv).toEqual({ CI: 'true' });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns the configured JWT secret without requiring DATABASE_URL', () => {
    expect(getJwtSecret({ JWT_SECRET: validJwtSecret })).toBe(validJwtSecret);
  });

  it('rejects a missing JWT secret', () => {
    expect(() => loadApiEnv({ DATABASE_URL: validDatabaseUrl, API_PORT: '3000' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a short JWT secret', () => {
    expect(() =>
      getJwtSecret({
        JWT_SECRET: 'short-secret',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects an invalid API port', () => {
    expect(() =>
      loadApiEnv({
        DATABASE_URL: validDatabaseUrl,
        API_PORT: '70000',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/API_PORT/);
  });

  it('rejects an invalid frontend URL', () => {
    expect(() =>
      loadApiEnv({
        DATABASE_URL: validDatabaseUrl,
        FRONTEND_URL: 'not-a-url',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/FRONTEND_URL/);
  });
});
