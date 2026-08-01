import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, type CurrentUser } from '../shared/apiClient.js';
import { getRootNavigationItems } from '../shared/rootNavigation.js';
import { supportedLocales } from '../i18n/index.js';

const LANGUAGE_CODES: Record<string, string> = { ru: 'RU', en: 'EN', kk: 'KK', zh: 'ZH' };
const LANGUAGE_LABELS: Record<string, string> = { ru: 'Русский', en: 'English', kk: 'Қазақша', zh: '中文' };

export function PublicHomePage() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<Pick<CurrentUser, 'roles'> | null>(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const user = await getCurrentUser();
        if (isMounted) setCurrentUser({ roles: user.roles });
      } catch {
        if (isMounted) setCurrentUser(null);
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const primaryNavItem = getRootNavigationItems(currentUser)[0];
  const primaryHref = primaryNavItem.href;
  const primaryLabel = primaryNavItem.fallbackLabel
    ? t(primaryNavItem.labelKey, primaryNavItem.fallbackLabel)
    : t(primaryNavItem.labelKey);

  function scrollToFeatures() {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="public-home">
      <header className="public-home__header">
        <div className="public-home__container public-home__header-inner">
          <div className="public-home__brand">LearnSpace</div>
          <nav className="public-home__nav">
            <a href="#features">{t('publicHome.nav.features')}</a>
            <a href="#about">{t('publicHome.nav.about')}</a>
          </nav>
          <div className="public-home__header-actions">
            <div className="public-home__language" ref={languageMenuRef}>
              <button
                aria-controls="public-home-language-menu"
                aria-expanded={isLanguageMenuOpen}
                aria-haspopup="menu"
                className="public-home__language-button"
                onClick={() => setIsLanguageMenuOpen((value) => !value)}
                type="button"
              >
                {LANGUAGE_CODES[i18n.language] ?? 'RU'}
              </button>
              <div
                className={`public-home__language-menu${isLanguageMenuOpen ? ' public-home__language-menu--open' : ''}`}
                id="public-home-language-menu"
                role="menu"
              >
                {supportedLocales.map((locale) => (
                  <button
                    aria-checked={i18n.language === locale}
                    className={`public-home__language-option${i18n.language === locale ? ' public-home__language-option--active' : ''}`}
                    key={locale}
                    onClick={() => {
                      void i18n.changeLanguage(locale);
                      setIsLanguageMenuOpen(false);
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    {LANGUAGE_LABELS[locale]}
                  </button>
                ))}
              </div>
            </div>
            <Link className="ds-button ds-button--primary" to={primaryHref}>
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="public-home__hero">
          <div className="public-home__container public-home__hero-inner">
            <div>
              <h1>{t('publicHome.hero.title')}</h1>
              <p className="public-home__lead">{t('publicHome.hero.lead')}</p>
              <div className="public-home__hero-actions">
                <Link className="ds-button ds-button--primary" to={primaryHref}>
                  {t('publicHome.hero.start')}
                </Link>
                <button className="ds-button ds-button--secondary" onClick={scrollToFeatures} type="button">
                  {t('publicHome.hero.learnMore')}
                </button>
              </div>
            </div>
            <div className="public-home__preview">
              <h2>{t('publicHome.preview.title')}</h2>
              <div className="public-home__stats">
                <div className="public-home__stat">
                  <span>{t('publicHome.preview.active')}</span>
                  <strong>4</strong>
                </div>
                <div className="public-home__stat">
                  <span>{t('publicHome.preview.done')}</span>
                  <strong>12</strong>
                </div>
              </div>
              <div className="public-home__course">
                <strong>{t('publicHome.preview.course')}</strong>
                <div className="public-home__bar">
                  <span style={{ width: '72%' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-home__section" id="features">
          <div className="public-home__container">
            <h2>{t('publicHome.features.title')}</h2>
            <div className="public-home__features">
              <article className="public-home__feature">
                <h3>{t('publicHome.features.f1.title')}</h3>
                <p>{t('publicHome.features.f1.text')}</p>
              </article>
              <article className="public-home__feature">
                <h3>{t('publicHome.features.f2.title')}</h3>
                <p>{t('publicHome.features.f2.text')}</p>
              </article>
              <article className="public-home__feature">
                <h3>{t('publicHome.features.f3.title')}</h3>
                <p>{t('publicHome.features.f3.text')}</p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-home__footer">
        <div className="public-home__container">{t('publicHome.footer')}</div>
      </footer>
    </div>
  );
}
