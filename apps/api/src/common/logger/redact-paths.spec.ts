import { PINO_REDACT_PATHS, redactAnalyticsFilters } from './redact-paths';

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


it('removes custom field values from logged URLs and referrers', () => {
  expect(PINO_REDACT_PATHS).toContain('req.query.fieldFilters');
  expect(redactAnalyticsFilters('/reports/summary?field%46ilters=x&groupByField=shift')).toBe('/reports/summary?groupByField=shift');
  expect(redactAnalyticsFilters('https://example.test/analytics?fieldFilters=x&fieldFilters=y')).toBe('https://example.test/analytics');
});
