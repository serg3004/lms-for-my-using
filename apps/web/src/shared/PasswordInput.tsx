import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

/** A password field with an eye button that shows or hides what is typed. Texts reuse the sign-in keys (RU/EN/KK/ZH). */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button aria-label={visible ? t('login.hidePassword') : t('login.showPassword')} aria-pressed={visible} className="password-field__toggle" onClick={() => setVisible((value) => !value)} type="button">
      {visible ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.7 10.7 0 0112 4c5.2 0 8.8 4.5 9.7 6a1.8 1.8 0 010 2 16.6 16.6 0 01-3.1 3.6M6.2 6.2A16.3 16.3 0 002.3 10a1.8 1.8 0 000 2c.9 1.5 4.5 6 9.7 6 1.2 0 2.3-.2 3.3-.6" /></svg>
        : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.3 10a1.8 1.8 0 000 2c.9 1.5 4.5 6 9.7 6s8.8-4.5 9.7-6a1.8 1.8 0 000-2C20.8 8.5 17.2 4 12 4S3.2 8.5 2.3 10z" /><circle cx="12" cy="11" r="3" /></svg>}
    </button>
  </div>;
}
