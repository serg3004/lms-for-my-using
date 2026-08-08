import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@lms/shared/constants/locales';

import enCommon from './locales/en/common.json';
import kkCommon from './locales/kk/common.json';
import ruCommon from './locales/ru/common.json';
import zhCommon from './locales/zh/common.json';
import { loginResources } from './loginResources.js';

export { DEFAULT_LOCALE } from '@lms/shared/constants/locales';

export const supportedLocales = SUPPORTED_LOCALES;

void i18next.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    ru: { translation: { ...ruCommon, login: loginResources.ru } },
    en: { translation: { ...enCommon, login: loginResources.en } },
    kk: { translation: { ...kkCommon, login: loginResources.kk } },
    zh: { translation: { ...zhCommon, login: loginResources.zh } },
  },
  interpolation: {
    escapeValue: false,
  },
});
