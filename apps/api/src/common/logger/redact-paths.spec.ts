import { PINO_REDACT_PATHS } from './redact-paths';

describe('PINO_REDACT_PATHS', () => {
  it('covers authorization header', () => {
    expect(PINO_REDACT_PATHS).toContain('req.headers.authorization');
  });

  it('covers cookie header', () => {
    expect(PINO_REDACT_PATHS).toContain('req.headers.cookie');
    expect(PINO_REDACT_PATHS).toContain('req.headers["set-cookie"]');
    expect(PINO_REDACT_PATHS).toContain('res.headers["set-cookie"]');
  });

  it('covers password body field', () => {
    expect(PINO_REDACT_PATHS).toContain('req.body.password');
  });

  it('covers token body fields', () => {
    expect(PINO_REDACT_PATHS).toContain('req.body.token');
    expect(PINO_REDACT_PATHS).toContain('req.body.accessToken');
    expect(PINO_REDACT_PATHS).toContain('req.body.refreshToken');
    expect(PINO_REDACT_PATHS).toContain('req.body.resetToken');
    expect(PINO_REDACT_PATHS).toContain('req.body.csrfToken');
  });
});
