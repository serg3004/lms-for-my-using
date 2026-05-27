import { loadApiEnv } from './env';

const validJwtSecret = '0123456789abcdef0123456789abcdef';

describe('API environment validation', () => {
  it('loads a valid API environment', () => {
    const apiEnv = loadApiEnv({
      API_PORT: '3001',
      JWT_SECRET: validJwtSecret,
    });

    expect(apiEnv).toEqual({
      API_PORT: 3001,
      JWT_SECRET: validJwtSecret,
    });
  });

  it('rejects a missing JWT secret', () => {
    expect(() => loadApiEnv({ API_PORT: '3000' })).toThrow(/JWT_SECRET/);
  });

  it('rejects an invalid API port', () => {
    expect(() =>
      loadApiEnv({
        API_PORT: '70000',
        JWT_SECRET: validJwtSecret,
      }),
    ).toThrow(/API_PORT/);
  });
});
