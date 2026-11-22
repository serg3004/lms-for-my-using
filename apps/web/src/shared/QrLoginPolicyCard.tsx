import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getQrLoginPolicy, saveQrLoginPolicy } from './api/qrLogin.js';
import { AdminCard, FormField } from './adminPage.js';

const roles = ['learner', 'mentor', 'instructor', 'manager', 'admin'] as const;
type State = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError';

/** PR 505: the administrator switches sign-in by QR on, sets how long such a session lasts and which roles may use it. */
export function QrLoginPolicyCard({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState('8');
  const [allowed, setAllowed] = useState<string[]>(['learner', 'mentor', 'instructor']);
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    getQrLoginPolicy(organizationId)
      .then((policy) => { setEnabled(policy.enabled); setHours(String(policy.sessionHours)); setAllowed(policy.roles); setState('ready'); })
      .catch(() => setState('loadError'));
  }, [organizationId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState('saving');
    try {
      const saved = await saveQrLoginPolicy(organizationId, { enabled, sessionHours: Number(hours), roles: allowed });
      setEnabled(saved.enabled); setHours(String(saved.sessionHours)); setAllowed(saved.roles);
      setState('saved');
    } catch {
      setState('saveError');
    }
  }
  const toggle = (role: string) => { setAllowed((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]); setState('ready'); };

  return (
    <AdminCard>
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        <h2>{t('qrLogin.policy.title')}</h2>
        <p>{t('qrLogin.policy.hint')}</p>
        {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('qrLogin.policy.loadError')}</p> : null}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setState('ready'); }} />
          <span>{t('qrLogin.policy.enable')}</span>
        </label>
        <FormField id="qr-session-hours" label={t('qrLogin.policy.hours')} hint={t('qrLogin.policy.hoursHint')}>
          <input id="qr-session-hours" type="number" min={1} max={24} required value={hours} onChange={(event) => { setHours(event.target.value); setState('ready'); }} />
        </FormField>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700 }}>{t('qrLogin.policy.roles')}</legend>
          {roles.map((role) => (
            <label key={role} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={allowed.includes(role)} onChange={() => toggle(role)} />
              <span>{t(`qrLogin.policy.role.${role}`)}</span>
            </label>
          ))}
        </fieldset>
        <p style={{ fontSize: '0.875rem' }}>{t('qrLogin.policy.customRoles')}</p>
        {allowed.some((role) => role === 'admin' || role === 'manager') ? <p className="admin-form__error" role="status">{t('qrLogin.policy.wideWarning')}</p> : null}
        {state === 'saved' ? <p role="status">{t('qrLogin.policy.saved')}</p> : null}
        {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('qrLogin.policy.saveError')}</p> : null}
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--primary" disabled={state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('qrLogin.policy.saving') : t('qrLogin.policy.save')}</button>
        </div>
      </form>
    </AdminCard>
  );
}
