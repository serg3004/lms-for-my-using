import { getJwtSecret, loadApiEnv } from './env';

const validJwtSecret = '0123456789abcdef0123456789abcdef';

describe('API environment validation', () => {
  it('loads a valid API environment', () => {
    const apiEnv = loadApiEnv({
      API_PORT: '3001',
      FRONTEND_URL: 'http://localhost:5173',
      JWT_SECRET: validJwtSecret,
    });

    expect(apiEnv).toEqual({
      API_PORT: 3001,
      FRONTEND_URL: 'http://localhost:5173',
      JWT_SECRET: validJwtSecret,
    });
  });

  it('uses default frontend URL for local development', () => {
    const apiEnv = loadApiEnv({
      JWT_SECRET: validJwtSecret,
    });

    expect(apiEnv.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('returns the configured JWT secret', () => {
    expect(getJwtSecret({ JWT_SECRET: validJwtSecret })).toBe(validJwtSecret);
  });

  it('rejects a missing JWT secret', () => {
    expect(() => loadApiEnv({ API_PORT: '3000' })).toThrow(/JWT_SECRET/);
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
        API_PORT: '70000',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/API_PORT/);
  });

  it('rejects an invalid frontend URL', () => {
    expect(() =>
      loadApiEnv({
        FRONTEND_URL: 'not-a-url',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/FRONTEND_URL/);
  });
});
