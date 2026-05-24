import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import kkCommon from './locales/kk/common.json';
import ruCommon from './locales/ru/common.json';
import zhCommon from './locales/zh/common.json';

export const DEFAULT_LOCALE = 'ru';

export const supportedLocales = ['ru', 'en', 'kk', 'zh'] as const;

void i18next.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    ru: { translation: ruCommon },
    en: { translation: enCommon },
    kk: { translation: kkCommon },
    zh: { translation: zhCommon },
  },
  interpolation: {
    escapeValue: false,
  },
});
