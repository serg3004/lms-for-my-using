import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getOrganizationFeatures, saveOrganizationFeatures } from '../../shared/api/organizations.js';
import { ConfirmDialog } from '../../shared/adminPage.js';
import { useAsyncData } from '../../shared/useAsyncData.js';

/** PR 485: the per-organization switch of custom roles. While it is off nothing a role grants has any effect. */
export function CustomRolesSwitch({ organizationId, onChanged }: { organizationId: string; onChanged?: (enabled: boolean) => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const { state, reload } = useAsyncData(() => getOrganizationFeatures(organizationId), [organizationId], {
    unauthenticated: t('customRoles.sessionExpired', 'Your session expired. Sign in again.'),
    error: t('customRoles.switchLoadFailed', 'Could not read the switch.'),
  });
  if (state.status !== 'loaded') return state.status === 'loading' ? null : <p role="alert" className="admin-form__error">{state.message}</p>;
  const enabled = state.data.customRolesEnabled === true;

  async function change() {
    setAsking(false); setError('');
    try {
      const saved = await saveOrganizationFeatures(organizationId, { longreadEnabled: state.status === 'loaded' ? state.data.longreadEnabled : false, customRolesEnabled: !enabled });
      onChanged?.(saved.customRolesEnabled === true);
      await reload();
    } catch { setError(t('customRoles.switchSaveFailed', 'Could not change the switch. Try again.')); }
  }

  return <article className="admin-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ minWidth: 0, flex: '1 1 280px' }}>
      <strong>{enabled ? t('customRoles.switchOn', 'Custom roles are on') : t('customRoles.switchOff', 'Custom roles are off')}</strong>
      <p className="admin-form__hint" style={{ margin: '4px 0 0' }}>{enabled ? t('customRoles.switchOnHint', 'Rights from custom roles work for assigned users from their next request.') : t('customRoles.switchOffHint', 'You can create and assign roles now, but they change nothing until you turn them on.')}</p>
      {error ? <p className="admin-form__error" role="alert">{error}</p> : null}
    </div>
    <button className={`admin-btn ${enabled ? 'admin-btn--secondary' : 'admin-btn--primary'}`} onClick={() => setAsking(true)} type="button">{enabled ? t('customRoles.turnOff', 'Turn off') : t('customRoles.turnOn', 'Turn on')}</button>
    <ConfirmDialog
      cancelLabel={t('customRoles.cancel', 'Cancel')}
      confirmLabel={enabled ? t('customRoles.turnOff', 'Turn off') : t('customRoles.turnOn', 'Turn on')}
      message={enabled ? t('customRoles.turnOffConfirm', 'Turn custom roles off? Only the built-in roles will work; saved roles and assignments stay.') : t('customRoles.turnOnConfirm', 'Turn custom roles on? Users with assigned roles get the rights of those roles from their next request.')}
      onCancel={() => setAsking(false)}
      onConfirm={() => void change()}
      open={asking}
      title={t('customRoles.switchTitle', 'Custom roles switch')}
    />
  </article>;
}
