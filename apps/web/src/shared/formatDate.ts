import i18next from 'i18next';

export type DateFormatOptions = Intl.DateTimeFormatOptions;

/** Format system dates with the active i18n locale. Authored date-like text is intentionally untouched. */
export function formatDate(
  value: string | Date,
  locale: string | undefined = i18next.resolvedLanguage ?? i18next.language ?? 'ru',
  options: DateFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatNullableDate(
  value: string | null,
  fallback: string,
  locale = i18next.resolvedLanguage ?? i18next.language ?? 'ru',
  options: DateFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (!value) {
    return fallback;
  }

  return formatDate(value, locale, options);
}
