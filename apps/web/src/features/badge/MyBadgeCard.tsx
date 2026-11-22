import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { changeOwnBadgePin, getOwnBadge, reportOwnBadgeLost, type OwnBadge } from '../../shared/api/badge.js';
import { formatDate } from '../../shared/formatDate.js';
import { ConfirmDialog } from '../../shared/ui.js';

type Notice = 'pinSaved' | 'pinError' | 'lostDone' | 'lostError' | null;

/**
 * PR 506: "My badge" in the profile. It appears only for a person who has an active badge; it shows no token. The employee can
 * choose their own PIN and report the badge lost, which revokes it at once.
 */
export function MyBadgeCard({ className = 'learner-profile__card' }: { className?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<OwnBadge | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    getOwnBadge().then(setState).catch(() => setLoadError(true));
  }, []);

  async function savePin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await changeOwnBadgePin(pin);
      setPin('');
      setNotice('pinSaved');
    } catch {
      setNotice('pinError');
    } finally {
      setBusy(false);
    }
  }

  async function reportLost() {
    setBusy(true);
    setNotice(null);
    try {
      await reportOwnBadgeLost();
      setState((current) => (current ? { ...current, badge: null } : current));
      setNotice('lostDone');
    } catch {
      setNotice('lostError');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  // Most people have no badge; a failed lookup is not worth an alert on their profile.
  if (loadError) return null;
  if (!state) return null;
  if (!state.badge) return notice === 'lostDone' ? <section className={className}><h2>{t('badge.mine.title')}</h2><p role="status">{t('badge.mine.lostDone')}</p></section> : null;

  const when = (value: string) => formatDate(value, undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section className={className} aria-labelledby="my-badge-title">
      <h2 id="my-badge-title">{t('badge.mine.title')}</h2>
      <p>{t('badge.mine.hint')}</p>
      <p>{t('badge.mine.issued')}: {when(state.badge.issuedAt)}. {t('badge.mine.lastUsed')}: {state.badge.lastUsedAt ? when(state.badge.lastUsedAt) : t('badge.mine.never')}.</p>
      <form onSubmit={(event) => void savePin(event)} style={{ display: 'grid', gap: '0.5rem', maxWidth: '22rem' }}>
        <h3 style={{ margin: 0 }}>{t('badge.mine.pinTitle')}</h3>
        <p style={{ margin: 0 }}>{t('badge.mine.pinHint')}</p>
        {state.pinRequired ? null : <p style={{ margin: 0 }}>{t('badge.mine.pinOff')}</p>}
        <label htmlFor="my-badge-pin">{t('badge.mine.pinLabel')}</label>
        <input id="my-badge-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        <div className="learner-profile__actions">
          <button disabled={busy || pin.length < 4} type="submit">{t('badge.mine.pinSave')}</button>
          <button className="admin-btn admin-btn--danger" disabled={busy} type="button" onClick={() => setConfirming(true)}>{t('badge.mine.lost')}</button>
        </div>
      </form>
      {notice === 'pinSaved' && <p role="status">{t('badge.mine.pinSaved')}</p>}
      {notice === 'pinError' && <p role="alert">{t('badge.mine.pinError')}</p>}
      {notice === 'lostError' && <p role="alert">{t('badge.mine.lostError')}</p>}
      <ConfirmDialog open={confirming} title={t('badge.mine.lost')} message={t('badge.mine.lostConfirm')} confirmLabel={t('badge.mine.lost')} cancelLabel={t('badge.mine.cancel')} danger busy={busy}
        onConfirm={() => void reportLost()} onCancel={() => { if (!busy) setConfirming(false); }} />
    </section>
  );
}
