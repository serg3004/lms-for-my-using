import type { TFunction } from 'i18next';

import { ApiClientError } from './apiClient.js';

/** PR 488: the server says which password rules failed (`details[].code`, `too_short:N` carries the minimum); returns them as readable lines in the interface language, or null when the error is not a password-policy one. */
export function passwordViolationMessages(error: unknown, t: TFunction): string[] | null {
  if (!(error instanceof ApiClientError) || error.status !== 400) return null;
  const codes = error.details.filter((detail) => detail.field === 'password').map((detail) => detail.code);
  if (codes.length === 0) return null;
  return codes.map((code) => {
    const [name, count] = String(code).split(':');
    return t(`security.violations.${name}`, { count: Number(count) || undefined, defaultValue: t('security.invalidPassword') });
  });
}
