import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findPermissionAction } from '@lms/shared/permission-catalog';

import { ApiClientError } from '../../shared/apiClient.js';
import { assignCustomRole, getUserPermissions, listCustomRoles, revokeCustomRole, type CustomRole, type EffectivePermissionsView } from '../../shared/api/customRoles.js';
import { labelFor } from '../admin-custom-roles/model.js';
import { userName, type AdminUserSummary } from './model.js';

type Loaded = { view: EffectivePermissionsView; roles: CustomRole[] };

/** PR 485: custom roles of one user (assign, revoke) and the rights that result from all roles. */
export function UserRightsDialog({ user, onClose }: { user: AdminUserSummary | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleId, setRoleId] = useState('');

  const load = useCallback(async (target: AdminUserSummary) => {
    try {
      const [view, roles] = await Promise.all([getUserPermissions(target.id), listCustomRoles()]);
      setData({ view, roles }); setError('');
    } catch (failure) {
      setError(failure instanceof ApiClientError && failure.status === 403 ? t('customRoles.forbidden', 'Only an administrator can manage roles.') : t('userRights.loadFailed', 'Could not load the rights of this user.'));
    }
  }, [t]);

  useEffect(() => {
    const dialog = ref.current;
    if (user && dialog && !dialog.open) { returnFocus.current = document.activeElement as HTMLElement | null; dialog.showModal(); setData(null); setRoleId(''); void load(user); }
    else if (!user && dialog?.open) dialog.close();
  }, [user, load]);

  function close() { onClose(); requestAnimationFrame(() => returnFocus.current?.focus()); }

  async function change(action: () => Promise<unknown>) {
    if (!user) return;
    setBusy(true); setError('');
    try { await action(); setRoleId(''); await load(user); }
    catch { setError(t('customRoles.assignFailed', 'Could not change the assignment. Try again.')); }
    finally { setBusy(false); }
  }

  const held = new Set(data?.view.customRoles.map((role) => role.id));
  const available = data?.roles.filter((role) => role.state === 'active' && !held.has(role.id)) ?? [];

  return <dialog aria-labelledby={titleId} className="admin-dialog admin-user-dialog" ref={ref} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { if (user) close(); }}>
    <div className="admin-dialog__header"><h2 id={titleId}>{t('userRights.title', 'Rights: {{name}}', { name: user ? userName(user) : '' })}</h2><button aria-label={t('userRights.close', 'Close')} className="admin-dialog__close" onClick={close} type="button">✕</button></div>
    <div style={{ display: 'grid', gap: 16, padding: '16px 24px 24px' }}>
      {error ? <p className="admin-form__error" role="alert">{error}</p> : null}
      {!data && !error ? <p role="status">{t('userRights.loading', 'Loading...')}</p> : null}
      {data ? <>
        <section aria-labelledby="user-roles-title" style={{ display: 'grid', gap: 8 }}>
          <h3 id="user-roles-title" style={{ margin: 0 }}>{t('userRights.rolesTitle', 'Custom roles')}</h3>
          {data.view.customRolesEnabled ? null : <p className="admin-form__hint" role="status" style={{ margin: 0 }}>{t('userRights.switchOff', 'Custom roles are switched off for the organization, so they give nothing yet.')}</p>}
          {data.view.customRoles.length === 0 ? <p className="admin-form__hint" style={{ margin: 0 }}>{t('userRights.noRoles', 'No custom roles assigned.')}</p> : <ul className="admin-membership-list">
            {data.view.customRoles.map((role) => <li key={role.id}><span>{role.name}</span><button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busy} onClick={() => void change(() => revokeCustomRole(role.id, user!.id))} type="button">{t('customRoles.revoke', 'Revoke')}</button></li>)}
          </ul>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select aria-label={t('userRights.pickRole', 'Role to assign')} style={{ flex: '1 1 200px', minWidth: 0 }} value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="">{available.length === 0 ? t('userRights.noAvailable', 'No roles to assign') : t('userRights.pickRolePlaceholder', 'Choose a role')}</option>
              {available.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <button className="admin-btn admin-btn--primary" disabled={busy || !roleId} onClick={() => void change(() => assignCustomRole(roleId, user!.id))} type="button">{t('customRoles.assign', 'Assign')}</button>
          </div>
        </section>
        <section aria-labelledby="user-rights-title" style={{ display: 'grid', gap: 8 }}>
          <h3 id="user-rights-title" style={{ margin: 0 }}>{t('userRights.effectiveTitle', 'Resulting rights')}</h3>
          {data.view.permissions.length === 0 ? <p className="admin-form__hint" style={{ margin: 0 }}>{t('userRights.effectiveEmpty', 'No rights beyond viewing own learning.')}</p> : <ul className="admin-membership-list" style={{ maxHeight: 240, overflow: 'auto' }}>
            {data.view.permissions.map((permission) => {
              const item = findPermissionAction(permission.action);
              return <li key={permission.action}>
                <span>{item ? labelFor(item.labels, i18n.language) : permission.action}</span>
                <span className="admin-form__hint">{[permission.builtIn ? t('userRights.builtIn', 'built-in role') : '', ...permission.scopes.map((scope) => t(`customRoles.scopes.${scope}`, scope))].filter(Boolean).join(', ')}</span>
              </li>;
            })}
          </ul>}
        </section>
      </> : null}
    </div>
  </dialog>;
}
