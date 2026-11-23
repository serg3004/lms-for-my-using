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
import { telegramResources } from './telegramResources.js';
import { badgeResources } from './badgeResources.js';
import { employeeCardResources } from './employeeCardResources.js';
import { pwaResources } from './pwaResources.js';
import { themeResources } from './themeResources.js';
import { qrLoginResources } from './qrLoginResources.js';
import { userFieldsResources } from './userFieldsResources.js';
import { usersImportResources } from './usersImportResources.js';

export const DEFAULT_LOCALE = 'ru';

export const supportedLocales = ['ru', 'en', 'kk', 'zh'] as const;

void i18next.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    ru: { translation: { ...ruCommon, login: loginResources.ru, passwordReset: passwordResetResources.ru, security: securityResources.ru, usersImport: usersImportResources.ru, userFields: userFieldsResources.ru, identity: identityResources.ru, telegram: telegramResources.ru, qrLogin: qrLoginResources.ru, badge: badgeResources.ru, employeeCard: employeeCardResources.ru, pwa: pwaResources.ru, theme: themeResources.ru } },
    en: { translation: { ...enCommon, login: loginResources.en, passwordReset: passwordResetResources.en, security: securityResources.en, usersImport: usersImportResources.en, userFields: userFieldsResources.en, identity: identityResources.en, telegram: telegramResources.en, qrLogin: qrLoginResources.en, badge: badgeResources.en, employeeCard: employeeCardResources.en, pwa: pwaResources.en, theme: themeResources.en } },
    kk: { translation: { ...kkCommon, login: loginResources.kk, passwordReset: passwordResetResources.kk, security: securityResources.kk, usersImport: usersImportResources.kk, userFields: userFieldsResources.kk, identity: identityResources.kk, telegram: telegramResources.kk, qrLogin: qrLoginResources.kk, badge: badgeResources.kk, employeeCard: employeeCardResources.kk, pwa: pwaResources.kk, theme: themeResources.kk } },
    zh: { translation: { ...zhCommon, login: loginResources.zh, passwordReset: passwordResetResources.zh, security: securityResources.zh, usersImport: usersImportResources.zh, userFields: userFieldsResources.zh, identity: identityResources.zh, telegram: telegramResources.zh, qrLogin: qrLoginResources.zh, badge: badgeResources.zh, employeeCard: employeeCardResources.zh, pwa: pwaResources.zh, theme: themeResources.zh } },
  },
  interpolation: {
    escapeValue: false,
  },
});
