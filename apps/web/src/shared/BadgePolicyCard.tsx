import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getBadgePolicy, saveBadgePolicy } from './api/badge.js';
import { AdminCard, FormField } from './adminPage.js';

type State = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError';

/** PR 506: the administrator chooses whether a PIN is asked after a badge scan and how long a kiosk session may stay idle. */
export function BadgePolicyCard({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const [pinRequired, setPinRequired] = useState(true);
  const [idle, setIdle] = useState('30');
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    getBadgePolicy(organizationId)
      .then((policy) => { setPinRequired(policy.pinRequired); setIdle(String(policy.idleMinutes)); setState('ready'); })
      .catch(() => setState('loadError'));
  }, [organizationId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState('saving');
    try {
      const saved = await saveBadgePolicy(organizationId, { pinRequired, idleMinutes: Number(idle) });
      setPinRequired(saved.pinRequired); setIdle(String(saved.idleMinutes));
      setState('saved');
    } catch {
      setState('saveError');
    }
  }

  return (
    <AdminCard>
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        <h2>{t('badge.policy.title')}</h2>
        <p>{t('badge.policy.hint')}</p>
        <p style={{ fontSize: '0.875rem' }}>{t('badge.policy.roles')}</p>
        {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('badge.policy.loadError')}</p> : null}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={pinRequired} onChange={(event) => { setPinRequired(event.target.checked); setState('ready'); }} />
          <span>{t('badge.policy.pin')}</span>
        </label>
        <FormField id="badge-idle-minutes" label={t('badge.policy.idle')} hint={t('badge.policy.idleHint')}>
          <input id="badge-idle-minutes" type="number" min={15} max={120} required value={idle} onChange={(event) => { setIdle(event.target.value); setState('ready'); }} />
        </FormField>
        {state === 'saved' ? <p role="status">{t('badge.policy.saved')}</p> : null}
        {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('badge.policy.saveError')}</p> : null}
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--primary" disabled={state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('badge.policy.saving') : t('badge.policy.save')}</button>
        </div>
      </form>
    </AdminCard>
  );
}
