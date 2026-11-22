export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-csrf-token"]',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.query.fieldFilters',
  'req.body.cookie',
  'req.body.authorization',
  'req.body.apiKey',
  'req.body.clientSecret',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.resetToken',
  'req.body.csrfToken',
];


export function redactAnalyticsFilters(url: string): string {
  const index = url.indexOf('?');
  if (index < 0) return url;
  const params = new URLSearchParams(url.slice(index + 1));
  if (!params.has('fieldFilters')) return url;
  params.delete('fieldFilters');
  const query = params.toString();
  return url.slice(0, index) + (query ? '?' + query : '');
}
