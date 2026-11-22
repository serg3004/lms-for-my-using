import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCardPolicy, saveCardPolicy, type CardBlock } from './api/employeeCard.js';
import { AdminCard } from './adminPage.js';

const blocks: readonly CardBlock[] = ['courses', 'certificates', 'checklists', 'clearance'];
type State = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError';

/** PR 507: the administrator chooses which blocks of the employee card every signed-in user of the organization sees. */
export function EmployeeCardPolicyCard({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<CardBlock[]>([]);
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    getCardPolicy(organizationId).then((policy) => { setChosen(policy.blocks); setState('ready'); }).catch(() => setState('loadError'));
  }, [organizationId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState('saving');
    try { setChosen((await saveCardPolicy(organizationId, chosen)).blocks); setState('saved'); } catch { setState('saveError'); }
  }
  const toggle = (block: CardBlock, on: boolean) => { setChosen((current) => (on ? [...current, block] : current.filter((item) => item !== block))); setState('ready'); };

  return (
    <AdminCard>
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        <h2>{t('employeeCard.policy.title')}</h2>
        <p>{t('employeeCard.policy.hint')}</p>
        {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('employeeCard.policy.loadError')}</p> : null}
        {blocks.map((block) => (
          <label key={block} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={chosen.includes(block)} onChange={(event) => toggle(block, event.target.checked)} />
            <span>{t(`employeeCard.blocks.${block}`)}</span>
          </label>
        ))}
        <p style={{ fontSize: '0.875rem' }}>{t('employeeCard.policy.detailNote')}</p>
        {state === 'saved' ? <p role="status">{t('employeeCard.policy.saved')}</p> : null}
        {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('employeeCard.policy.saveError')}</p> : null}
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--primary" disabled={state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('employeeCard.policy.saving') : t('employeeCard.policy.save')}</button>
        </div>
      </form>
    </AdminCard>
  );
}
