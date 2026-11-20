import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LoginLocale = 'ru' | 'en' | 'kk' | 'zh';

export const LANGUAGE_KEY = 'lms-prototype-language';
const SUPPORTED_LOCALES: LoginLocale[] = ['ru', 'en', 'kk', 'zh'];
const LANGUAGE_LABELS: Record<LoginLocale, string> = { ru: 'Русский', en: 'English', kk: 'Қазақша', zh: '中文' };
const LANGUAGE_CODES: Record<LoginLocale, string> = { ru: 'RU', en: 'EN', kk: 'KK', zh: 'ZH' };

/** The language menu of the sign-in screens (sign in, password reset); the choice is remembered in the browser. */
export function LoginLanguageMenu() {
  const { i18n } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const currentLocale = ((i18n.resolvedLanguage ?? i18n.language).split('-')[0] || 'ru') as LoginLocale;

  useEffect(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    if (storedLanguage && SUPPORTED_LOCALES.includes(storedLanguage as LoginLocale)) void i18n.changeLanguage(storedLanguage);
  }, [i18n]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function choose(locale: LoginLocale) {
    localStorage.setItem(LANGUAGE_KEY, locale);
    void i18n.changeLanguage(locale);
    setIsOpen(false);
  }

  return (
    <div className="login-language" ref={menuRef}>
      <button aria-controls="login-language-menu" aria-expanded={isOpen} aria-haspopup="menu" className="login-language__button" onClick={() => setIsOpen((value) => !value)} type="button">
        {LANGUAGE_CODES[currentLocale] ?? 'RU'}
      </button>
      <div className={`login-language__menu${isOpen ? ' login-language__menu--open' : ''}`} id="login-language-menu" role="menu">
        {SUPPORTED_LOCALES.map((locale) => (
          <button aria-checked={currentLocale === locale} className={`login-language__option${currentLocale === locale ? ' login-language__option--active' : ''}`} key={locale} onClick={() => choose(locale)} role="menuitemradio" type="button" value={locale}>
            {LANGUAGE_LABELS[locale]}
          </button>
        ))}
      </div>
    </div>
  );
}
