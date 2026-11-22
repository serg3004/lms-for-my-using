/**
 * PR 507: an outside inspector signs in as an ordinary invited user but reaches only the employee card. Everything else is
 * closed in the guard, whatever role the account carries.
 */
const allowed: ReadonlyArray<readonly [string, RegExp]> = [
  ['POST', /^\/employee-card\/(?:open|photo|checked)$/],
];

const apiPrefix = /^\/api\/v1(?=\/)/;

export function isInspectorRoute(method: string | undefined, urlPath: string): boolean {
  const path = urlPath.replace(apiPrefix, '').replace(/\/+$/, '');
  const verb = (method ?? 'GET').toUpperCase();
  return allowed.some(([allowedMethod, pattern]) => allowedMethod === verb && pattern.test(path));
}

export function inspectorRestrictedBody() {
  return { error: { code: 'FORBIDDEN', message: 'An inspector account can open only the employee card', details: [{ code: 'INSPECTOR_SESSION_RESTRICTED', message: 'An inspector account can open only the employee card' }] } };
}
