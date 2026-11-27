import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { LoginLanguageMenu } from '../shared/LoginLanguageMenu.js';
import { detectPlatform, installOffer, isInAppBrowser, isInstalled, isSafariOnIos, onInstallOfferChange, runInstall, type InstallPlatform } from '../shared/pwa.js';
import { SkipLink } from '../shared/ui.js';

/**
 * PR 572: the public "Install the app" page (`/install`), opened from a link in an e-mail or a Telegram message. It needs
 * no sign-in and shows nothing about any organization or person: only what to do on this kind of device.
 */
export function InstallPage({ platform = detectPlatform(), inApp = isInAppBrowser(), safari = isSafariOnIos(), installed = isInstalled() }: { platform?: InstallPlatform; inApp?: boolean; safari?: boolean; installed?: boolean }) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => onInstallOfferChange(() => refresh((n) => n + 1)), []);
  const offer = installOffer();
  const p = (key: string) => t(`pwa.page.${key}`);

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { /* the address bar still has the link */ }
  }

  let body;
  if (installed) {
    body = <p role="status">{p('installed')}</p>;
  } else if (inApp) {
    body = <>
      <p role="status">{p('inApp')}</p>
      <p>{platform === 'ios' ? p('inAppIos') : p('inAppAndroid')}</p>
      <button className="login-form__submit" type="button" onClick={() => void copyLink()}>{copied ? p('copied') : p('copyLink')}</button>
    </>;
  } else if (platform === 'ios') {
    body = <p>{safari ? p('iosSteps') : p('iosOtherBrowser')}</p>;
  } else if (platform === 'android') {
    body = <>
      {offer ? <><p>{p('androidOffer')}</p><button className="login-form__submit" type="button" onClick={() => void runInstall()}>{t('pwa.install')}</button></> : null}
      <p>{p('androidSteps')}</p>
    </>;
  } else {
    body = <p>{p('desktop')}</p>;
  }

  return <>
    <SkipLink label={t('a11y.skipToContent')} />
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-hero" aria-labelledby="install-hero-title">
        <div className="login-hero__brand">LearnSpace</div>
        <div className="login-hero__content"><h1 id="install-hero-title">{p('heroTitle')}</h1><p>{p('heroText')}</p></div>
        <div className="login-hero__footer">LearnSpace</div>
      </section>
      <section className="login-side">
        <LoginLanguageMenu />
        <div className="login-card">
          <header className="login-header"><h2>{p('title')}</h2></header>
          {body}
          <Link className="password-reset-secondary" to="/login">{p('toLogin')}</Link>
        </div>
      </section>
    </main>
  </>;
}
