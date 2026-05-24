export const DEFAULT_LOCALE = 'ru';

export const SUPPORTED_LOCALES = ['ru', 'en', 'kk', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
