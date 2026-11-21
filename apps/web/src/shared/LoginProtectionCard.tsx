import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLoginProtection, listLockedUsers, saveLoginProtection, unlockUser, type LockedUser } from './api/organizations.js';
import { AdminCard, FormField } from './adminPage.js';
import { formatDate } from './formatDate.js';

type State = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError';

/** PR 493: thresholds of the sign-in protection and the accounts it has locked, with a manual unlock. */
export function LoginProtectionCard({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const [maxFailures, setMaxFailures] = useState('5');
  const [windowMinutes, setWindowMinutes] = useState('15');
  const [lockMinutes, setLockMinutes] = useState('15');
  const [state, setState] = useState<State>('loading');
  const [locked, setLocked] = useState<LockedUser[] | null>(null);
  const [lockedError, setLockedError] = useState<'load' | 'unlock' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadLocked = useCallback(() => {
    listLockedUsers().then((users) => { setLocked(users); setLockedError(null); }).catch(() => setLockedError('load'));
  }, []);

  useEffect(() => {
    getLoginProtection(organizationId)
      .then((settings) => { setMaxFailures(String(settings.maxFailures)); setWindowMinutes(String(settings.windowMinutes)); setLockMinutes(String(settings.lockMinutes)); setState('ready'); })
      .catch(() => setState('loadError'));
    loadLocked();
  }, [organizationId, loadLocked]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState('saving');
    try {
      const saved = await saveLoginProtection(organizationId, { maxFailures: Number(maxFailures), windowMinutes: Number(windowMinutes), lockMinutes: Number(lockMinutes) });
      setMaxFailures(String(saved.maxFailures));
      setWindowMinutes(String(saved.windowMinutes));
      setLockMinutes(String(saved.lockMinutes));
      setState('saved');
    } catch {
      setState('saveError');
    }
  }

  async function unlock(user: LockedUser) {
    setBusyId(user.id);
    try {
      await unlockUser(user.id);
      setLocked((current) => (current ?? []).filter((item) => item.id !== user.id));
      setLockedError(null);
    } catch {
      setLockedError('unlock');
    } finally {
      setBusyId(null);
    }
  }

  const edit = (setter: (value: string) => void) => (event: { target: { value: string } }) => { setter(event.target.value); setState('ready'); };

  return (
    <>
      <AdminCard>
        <form className="admin-form" onSubmit={(event) => void save(event)}>
          <h2>{t('security.lockTitle')}</h2>
          <p>{t('security.lockHint')}</p>
          {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('security.lockLoadError')}</p> : null}
          <div className="admin-form__row">
            <FormField id="lock-max-failures" label={t('security.maxFailures')}>
              <input id="lock-max-failures" type="number" min={3} max={20} required value={maxFailures} onChange={edit(setMaxFailures)} />
            </FormField>
            <FormField id="lock-window" label={t('security.windowMinutes')}>
              <input id="lock-window" type="number" min={1} max={120} required value={windowMinutes} onChange={edit(setWindowMinutes)} />
            </FormField>
            <FormField id="lock-minutes" label={t('security.lockMinutes')}>
              <input id="lock-minutes" type="number" min={1} max={1440} required value={lockMinutes} onChange={edit(setLockMinutes)} />
            </FormField>
          </div>
          {state === 'saved' ? <p role="status">{t('security.lockSaved')}</p> : null}
          {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('security.lockSaveError')}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--primary" disabled={state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('security.savingPolicy') : t('security.lockSave')}</button>
          </div>
        </form>
      </AdminCard>
      <AdminCard>
        <div className="admin-form">
          <h2>{t('security.lockedTitle')}</h2>
          <p>{t('security.lockedHint')}</p>
          {lockedError === 'load' ? <p className="admin-form__error" role="alert">{t('security.lockedLoadError')}</p> : null}
          {lockedError === 'unlock' ? <p className="admin-form__error" role="alert">{t('security.unlockError')}</p> : null}
          {locked && locked.length === 0 ? <p role="status">{t('security.lockedNone')}</p> : null}
          {locked && locked.length > 0 ? (
            <ul>
              {locked.map((user) => (
                <li key={user.id}>
                  <strong>{[user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ')}</strong> ({user.email}) — {t('security.lockedUntil', { time: formatDate(user.loginLockedUntil, undefined, { timeStyle: 'short', dateStyle: 'medium' }) })}{' '}
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busyId === user.id} onClick={() => void unlock(user)} type="button">{busyId === user.id ? t('security.unlocking') : t('security.unlock')}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </AdminCard>
    </>
  );
}
