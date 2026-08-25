import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { supportedLocales } from '../i18n/index.js';
import { updateCurrentUserPreferences } from '../shared/apiClient.js';
import { useSession } from '../shared/session.js';

const localeNames = { ru: 'Русский', en: 'English', kk: 'Қазақша', zh: '中文' } as const;

export function LearnerProfilePage() {
  const { t, i18n } = useTranslation();
  const { currentUser, status, refreshUser } = useSession();
  const [locale, setLocale] = useState('ru');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (currentUser) setLocale(supportedLocales.includes(currentUser.locale as typeof supportedLocales[number]) ? currentUser.locale : 'ru');
  }, [currentUser]);

  if (status === 'loading' || status === 'idle') return <div className="learner-profile__state" role="status">{t('profile.loading')}</div>;
  if (!currentUser) return <div className="learner-profile__state" role="alert">{t('profile.loadError')}</div>;

  async function savePreferences() {
    setSaveState('saving');
    try {
      const previousLocale = i18n.resolvedLanguage ?? i18n.language;
      await i18n.changeLanguage(locale);
      try {
        await updateCurrentUserPreferences({ locale });
        await refreshUser();
        setSaveState('saved');
      } catch (error) {
        await i18n.changeLanguage(previousLocale);
        throw error;
      }
    } catch {
      setSaveState('error');
    }
  }

  const fullName = [currentUser.firstName, currentUser.middleName, currentUser.lastName].filter(Boolean).join(' ');

  return (
    <section className="learner-profile" aria-labelledby="learner-profile-title">
      <header>
        <h1 id="learner-profile-title">{t('profile.title')}</h1>
        <p>{t('profile.subtitle')}</p>
      </header>
      <div className="learner-profile__card">
        <h2>{t('profile.identityTitle')}</h2>
        <dl className="learner-profile__identity">
          <div><dt>{t('profile.name')}</dt><dd>{fullName}</dd></div>
          <div><dt>{t('profile.email')}</dt><dd>{currentUser.email}</dd></div>
          <div><dt>{t('profile.position')}</dt><dd>{currentUser.position || t('profile.notSpecified')}</dd></div>
        </dl>
        <p className="learner-profile__readonly">{t('profile.readonlyHint')}</p>
      </div>
      <form className="learner-profile__card" onSubmit={(event) => { event.preventDefault(); void savePreferences(); }}>
        <h2>{t('profile.preferencesTitle')}</h2>
        <label htmlFor="profile-locale">{t('profile.language')}</label>
        <select id="profile-locale" value={locale} onChange={(event) => { setLocale(event.target.value); setSaveState('idle'); }}>
          {supportedLocales.map((value) => <option key={value} value={value}>{localeNames[value]}</option>)}
        </select>
        <div className="learner-profile__actions">
          <button disabled={saveState === 'saving' || locale === currentUser.locale} type="submit">
            {saveState === 'saving' ? t('profile.saving') : t('profile.save')}
          </button>
          {saveState === 'saved' ? <span role="status">{t('profile.saved')}</span> : null}
          {saveState === 'error' ? <span role="alert">{t('profile.saveError')}</span> : null}
        </div>
      </form>
    </section>
  );
}
