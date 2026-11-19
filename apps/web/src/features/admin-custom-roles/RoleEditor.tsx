import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findPermissionAction, type PermissionScope } from '@lms/shared/permission-catalog';

import { FormField } from '../../shared/adminPage.js';
import type { RoleGrant } from '../../shared/api/customRoles.js';
import { delegableByGroup, dependentActions, labelFor, requiredActions, setScope, toggleAction, type RoleForm, type RoleFormErrors } from './model.js';

const groups = delegableByGroup();
const grid = { display: 'grid', gap: 8 } as const;
const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' } as const;

type Props = {
  form: RoleForm;
  errors: RoleFormErrors;
  readOnly: boolean;
  onChange: (form: RoleForm) => void;
};

/** PR 485: name, description and the grants by area; every grant has its own scope and a dependency hint. */
export function RoleEditor({ form, errors, readOnly, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const [notice, setNotice] = useState('');
  const noticeId = useId();
  // On a phone the areas are folded so the page does not become one long list; on a desktop they are open.
  const [wide] = useState(() => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches);
  const held = new Map(form.grants.map((grant) => [grant.action, grant]));
  const actionName = (key: string) => {
    const item = findPermissionAction(key);
    return item ? labelFor(item.labels, i18n.language) : key;
  };

  function toggle(key: string, on: boolean) {
    const result = toggleAction(form.grants, key, on);
    onChange({ ...form, grants: result.grants });
    setNotice(result.changed.length === 0 ? '' : on
      ? t('customRoles.addedRequired', 'Also added what this right needs: {{names}}.', { names: result.changed.map(actionName).join(', ') })
      : t('customRoles.removedDependents', 'Also removed what needs this right: {{names}}.', { names: result.changed.map(actionName).join(', ') }));
  }

  return <div className="admin-form" style={grid}>
    <FormField id="role-name" label={t('customRoles.fieldName', 'Role name')} required error={errors.name ? t(errors.name === 'required' ? 'customRoles.nameRequired' : 'customRoles.nameTooLong', errors.name === 'required' ? 'Enter a role name' : 'The name is longer than 80 characters') : undefined}>
      <input id="role-name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'role-name-error' : undefined} disabled={readOnly} maxLength={200} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
    </FormField>
    <FormField id="role-description" label={t('customRoles.fieldDescription', 'Description')} hint={t('customRoles.descriptionHint', 'Shown to administrators only.')}>
      <textarea id="role-description" disabled={readOnly} maxLength={500} rows={2} value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
    </FormField>
    <h3 style={{ margin: 0 }}>{t('customRoles.permissionsTitle', 'Permissions')}</h3>
    <p className="admin-form__hint" style={{ margin: 0 }}>{t('customRoles.permissionsHint', 'Rights are only added: a custom role never takes away what a user already has. Choose the scope for every right.')}</p>
    {errors.grants ? <p className="admin-form__field-error" role="alert">{errors.grants === 'empty' ? t('customRoles.grantsEmpty', 'Choose at least one right') : t('customRoles.grantsInvalid', 'The set of rights is not valid: a right is missing something it needs.')}</p> : null}
    <p id={noticeId} role="status" className="admin-form__hint" style={{ margin: 0, minHeight: notice ? undefined : 0 }}>{notice}</p>
    {groups.map(({ group, actions }) => {
      const count = actions.filter((item) => held.has(item.key)).length;
      return <details key={group} open={wide || count > 0} className="admin-card" style={{ padding: '8px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t(`customRoles.groups.${group}`, group)}{count > 0 ? ` · ${count}` : ''}</summary>
        <div style={{ ...grid, marginTop: 8 }}>
          {actions.map((item) => {
            const grant: RoleGrant | undefined = held.get(item.key);
            const needs = requiredActions(item.key);
            const inputId = `grant-${item.key}`;
            return <div key={item.key} style={{ ...grid, gap: 4 }}>
              <div style={rowStyle}>
                <label htmlFor={inputId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input id={inputId} type="checkbox" checked={Boolean(grant)} disabled={readOnly} onChange={(event) => toggle(item.key, event.target.checked)} />
                  {labelFor(item.labels, i18n.language)}
                </label>
                {grant ? <select aria-label={t('customRoles.scopeFor', 'Scope: {{name}}', { name: labelFor(item.labels, i18n.language) })} disabled={readOnly || item.scopes.length < 2} value={grant.scope} onChange={(event) => onChange({ ...form, grants: setScope(form.grants, item.key, event.target.value as PermissionScope) })}>
                  {item.scopes.map((scope) => <option key={scope} value={scope}>{t(`customRoles.scopes.${scope}`, scope)}</option>)}
                </select> : null}
              </div>
              {needs.length > 0 || dependentActions(item.key).length > 0 ? <span className="admin-form__hint">
                {needs.length > 0 ? t('customRoles.needs', 'Needs: {{names}}.', { names: needs.map(actionName).join(', ') }) : ''}
              </span> : null}
            </div>;
          })}
        </div>
      </details>;
    })}
  </div>;
}
