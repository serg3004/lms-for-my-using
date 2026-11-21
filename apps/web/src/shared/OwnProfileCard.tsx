import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiDownloadRequest } from './apiClient.js';
import { getOwnProfile, removeOwnPhoto, updateOwnProfile, uploadOwnPhoto, type OwnProfile } from './api/auth.js';
import { useSession } from './session.js';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 1_048_576;
const ABOUT_MAX = 500;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{3,23}[0-9]$/;
/**
 * Refreshing the session shows the page's loading state for a moment and remounts this card, so the "saved" notice
 * would be lost; it is carried over the remount here.
 */
let savedNoticePending = false;
const FALLBACK_ZONES = ['Asia/Almaty', 'Asia/Qyzylorda', 'Asia/Aqtobe', 'Asia/Oral', 'Europe/Moscow', 'Asia/Shanghai', 'UTC'];

function timeZones(current: string): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES;
  return supported.includes(current) ? supported : [current, ...supported];
}

/** PR 496: the person's own profile: photo, phone, time zone and a short note. Name, email, position and role are not editable here. */
export function OwnProfileCard({ className = 'learner-profile__card' }: { className?: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(() => {
    const pending = savedNoticePending;
    savedNoticePending = false;
    return pending ? { kind: 'ok', text: t('security.profileSaved') } : null;
  });
  const [fieldError, setFieldError] = useState<'phone' | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const apply = useCallback((next: OwnProfile) => {
    setProfile(next);
    setPhone(next.phone ?? '');
    setTimezone(next.timezone);
    setAboutMe(next.aboutMe ?? '');
  }, []);

  const load = useCallback(() => {
    getOwnProfile().then((next) => { apply(next); setLoadFailed(false); }).catch(() => setLoadFailed(true));
  }, [apply]);
  useEffect(load, [load]);

  // The picture is private: it is fetched with the session and shown from a local object URL.
  const photoVersion = profile?.hasPhoto ? profile.version : null;
  useEffect(() => {
    if (photoVersion === null) { setPhotoUrl(null); return undefined; }
    let url: string | null = null;
    let active = true;
    apiDownloadRequest('/users/me/photo').then(({ blob }) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPhotoUrl(url);
    }).catch(() => { if (active) setPhotoUrl(null); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [photoVersion]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_PATTERN.test(trimmedPhone)) { setFieldError('phone'); setMessage(null); return; }
    setFieldError(null);
    setBusy(true);
    try {
      const next = await updateOwnProfile({ version: profile.version, phone: trimmedPhone || null, timezone, aboutMe: aboutMe.trim() || null });
      const sessionChanged = next.phone !== profile.phone || next.timezone !== profile.timezone;
      apply(next);
      setMessage({ kind: 'ok', text: t('security.profileSaved') });
      if (sessionChanged) {
        savedNoticePending = true;
        await session.refreshUser();
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        load();
        setMessage({ kind: 'error', text: t('security.profileConflict') });
      } else {
        setMessage({ kind: 'error', text: t('security.profileSaveError') });
      }
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { setMessage({ kind: 'error', text: t('security.photoBadType') }); return; }
    if (file.size > PHOTO_MAX_BYTES) { setMessage({ kind: 'error', text: t('security.photoTooBig') }); return; }
    await changePhoto(() => uploadOwnPhoto(file));
  }

  async function changePhoto(action: () => Promise<OwnProfile>) {
    setBusy(true);
    try {
      setProfile(await action());
      setMessage(null);
    } catch {
      setMessage({ kind: 'error', text: t('security.photoError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={className} aria-labelledby="own-profile-title">
      <h2 id="own-profile-title">{t('security.profileCardTitle')}</h2>
      <p>{t('security.profileCardHint')}</p>
      {loadFailed ? <p className="admin-form__error" role="alert">{t('security.profileLoadError')}</p> : null}
      {profile ? (
        <form onSubmit={(event) => void save(event)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBlockEnd: 12 }}>
            {photoUrl
              ? <img alt={t('security.photoAlt')} height={72} src={photoUrl} style={{ borderRadius: '50%', objectFit: 'cover' }} width={72} />
              : <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>?</span>}
            <div>
              <label htmlFor="own-profile-photo">{t('security.photoChoose')}</label>
              <input accept={PHOTO_TYPES.join(',')} disabled={busy} id="own-profile-photo" onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ''; }} type="file" />
              <p>{t('security.photoHint')}</p>
              {profile.hasPhoto ? <button className="admin-btn admin-btn--secondary" disabled={busy} onClick={() => void changePhoto(removeOwnPhoto)} type="button">{t('security.photoRemove')}</button> : null}
            </div>
          </div>
          <label htmlFor="own-profile-phone">{t('security.profilePhone')}</label>
          <input aria-describedby={fieldError ? 'own-profile-phone-error' : undefined} aria-invalid={fieldError === 'phone'} autoComplete="tel" id="own-profile-phone" maxLength={25} onChange={(event) => { setPhone(event.target.value); setFieldError(null); }} type="tel" value={phone} />
          {fieldError === 'phone' ? <p className="admin-form__error" id="own-profile-phone-error" role="alert">{t('security.profilePhoneInvalid')}</p> : null}
          <label htmlFor="own-profile-timezone">{t('security.profileTimezone')}</label>
          <select id="own-profile-timezone" onChange={(event) => setTimezone(event.target.value)} value={timezone}>
            {timeZones(profile.timezone).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <label htmlFor="own-profile-about">{t('security.profileAbout')}</label>
          <textarea id="own-profile-about" maxLength={ABOUT_MAX} onChange={(event) => setAboutMe(event.target.value)} rows={4} value={aboutMe} />
          <p>{t('security.profileAboutCounter', { count: aboutMe.length, max: ABOUT_MAX })}</p>
          <p>{t('security.profileReadonly')}</p>
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--primary" disabled={busy} type="submit">{busy ? t('security.profileSaving') : t('security.profileSave')}</button>
            {message ? <span role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
          </div>
        </form>
      ) : loadFailed ? null : <p role="status">{t('security.loading')}</p>}
    </section>
  );
}
