import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { InstallPage } from './InstallPage';
import { detectPlatform, isInAppBrowser, isSafariOnIos } from '../shared/pwa';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ru', changeLanguage: () => undefined } }) }));
vi.mock('../shared/LoginLanguageMenu.js', () => ({ LoginLanguageMenu: () => null }));

const render = (props: Parameters<typeof InstallPage>[0]) => renderToStaticMarkup(<MemoryRouter><InstallPage {...props} /></MemoryRouter>);

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPHONE_TELEGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

describe('install page', () => {
  it('tells platforms and in-app browsers apart', () => {
    expect(detectPlatform(ANDROID_CHROME, 5)).toBe('android');
    expect(detectPlatform(IPHONE_SAFARI, 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36', 0)).toBe('desktop');
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false);
    expect(isInAppBrowser(ANDROID_WEBVIEW)).toBe(true);
    expect(isInAppBrowser(IPHONE_SAFARI)).toBe(false);
    expect(isInAppBrowser(IPHONE_CHROME)).toBe(false);
    expect(isInAppBrowser(IPHONE_TELEGRAM)).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) Telegram-Android/10.0')).toBe(true);
    expect(isSafariOnIos(IPHONE_SAFARI)).toBe(true);
    expect(isSafariOnIos(IPHONE_CHROME)).toBe(false);
  });

  it('shows the right instruction without any organization data', () => {
    expect(render({ platform: 'ios', inApp: false, safari: true, installed: false })).toContain('pwa.page.iosSteps');
    expect(render({ platform: 'ios', inApp: false, safari: false, installed: false })).toContain('pwa.page.iosOtherBrowser');
    expect(render({ platform: 'android', inApp: false, safari: false, installed: false })).toContain('pwa.page.androidSteps');
    expect(render({ platform: 'desktop', inApp: false, safari: false, installed: false })).toContain('pwa.page.desktop');
    const inApp = render({ platform: 'android', inApp: true, safari: false, installed: false });
    expect(inApp).toContain('pwa.page.inApp');
    expect(inApp).toContain('pwa.page.copyLink');
    expect(render({ platform: 'android', inApp: false, safari: false, installed: true })).toContain('pwa.page.installed');
  });
});
