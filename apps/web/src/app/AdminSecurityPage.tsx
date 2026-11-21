import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getPasswordPolicy, savePasswordPolicy } from '../shared/api/organizations.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { LoginProtectionCard } from '../shared/LoginProtectionCard.js';
import { MyDevicesCard } from '../shared/MyDevicesCard.js';
import { OwnProfileCard } from '../shared/OwnProfileCard.js';
import { ChangePasswordForm } from '../shared/ChangePasswordForm.js';
import { useSession } from '../shared/session.js';

/** PR 488: the administrator sets the organization's password policy and changes their own password. */
export function AdminSecurityPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [minLength, setMinLength] = useState('10');
  const [historyCount, setHistoryCount] = useState('3');
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError'>('loading');

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('security.navTitle'), href: '/admin/security', isCurrent: true },
  ];

  useEffect(() => {
    if (!currentUser) return;
    getPasswordPolicy(currentUser.organizationId)
      .then((policy) => { setMinLength(String(policy.minLength)); setHistoryCount(String(policy.historyCount)); setState('ready'); })
      .catch(() => setState('loadError'));
  }, [currentUser]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) return;
    setState('saving');
    try {
      const saved = await savePasswordPolicy(currentUser.organizationId, { minLength: Number(minLength), historyCount: Number(historyCount) });
      setMinLength(String(saved.minLength));
      setHistoryCount(String(saved.historyCount));
      setState('saved');
    } catch {
      setState('saveError');
    }
  }

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader eyebrow={t('security.eyebrow')} title={t('security.title')} subtitle={t('security.subtitle')} />
      <AdminCard>
        <form className="admin-form" onSubmit={(event) => void save(event)}>
          <h2>{t('security.policyTitle')}</h2>
          <p>{t('security.policyHint')}</p>
          {state === 'loading' ? <p role="status">{t('security.loading')}</p> : null}
          {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('security.loadError')}</p> : null}
          <div className="admin-form__row">
            <FormField id="policy-min-length" label={t('security.minLength')} hint={Number(minLength) < 8 ? t('security.weakWarning') : undefined}>
              <input id="policy-min-length" type="number" min={5} max={20} required value={minLength} onChange={(event) => { setMinLength(event.target.value); setState('ready'); }} />
            </FormField>
            <FormField id="policy-history" label={t('security.historyCount')}>
              <input id="policy-history" type="number" min={0} max={10} required value={historyCount} onChange={(event) => { setHistoryCount(event.target.value); setState('ready'); }} />
            </FormField>
          </div>
          {Number(minLength) < 8 ? <p className="admin-form__error" role="status">{t('security.weakWarning')}</p> : null}
          {state === 'saved' ? <p role="status">{t('security.policySaved')}</p> : null}
          {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('security.policySaveError')}</p> : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--primary" disabled={state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('security.savingPolicy') : t('security.savePolicy')}</button>
          </div>
        </form>
      </AdminCard>
      {currentUser ? <LoginProtectionCard organizationId={currentUser.organizationId} /> : null}
      <AdminCard>
        <ChangePasswordForm className="admin-form" />
      </AdminCard>
      <AdminCard>
        <OwnProfileCard className="admin-form" />
      </AdminCard>
      <AdminCard>
        <MyDevicesCard className="admin-form" />
      </AdminCard>
    </AdminPageLayout>
  );
}
