import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import kkCommon from './locales/kk/common.json';
import ruCommon from './locales/ru/common.json';
import zhCommon from './locales/zh/common.json';
import { loginResources } from './loginResources.js';
import { passwordResetResources } from './passwordResetResources.js';
import { securityResources } from './securityResources.js';
import { identityResources } from './identityResources.js';
import { userFieldsResources } from './userFieldsResources.js';
import { usersImportResources } from './usersImportResources.js';

export const DEFAULT_LOCALE = 'ru';

export const supportedLocales = ['ru', 'en', 'kk', 'zh'] as const;

void i18next.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    ru: { translation: { ...ruCommon, login: loginResources.ru, passwordReset: passwordResetResources.ru, security: securityResources.ru, usersImport: usersImportResources.ru, userFields: userFieldsResources.ru, identity: identityResources.ru } },
    en: { translation: { ...enCommon, login: loginResources.en, passwordReset: passwordResetResources.en, security: securityResources.en, usersImport: usersImportResources.en, userFields: userFieldsResources.en, identity: identityResources.en } },
    kk: { translation: { ...kkCommon, login: loginResources.kk, passwordReset: passwordResetResources.kk, security: securityResources.kk, usersImport: usersImportResources.kk, userFields: userFieldsResources.kk, identity: identityResources.kk } },
    zh: { translation: { ...zhCommon, login: loginResources.zh, passwordReset: passwordResetResources.zh, security: securityResources.zh, usersImport: usersImportResources.zh, userFields: userFieldsResources.zh, identity: identityResources.zh } },
  },
  interpolation: {
    escapeValue: false,
  },
});
