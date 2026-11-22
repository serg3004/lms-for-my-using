import { useTranslation } from 'react-i18next';

import type { UserFieldView } from '../../shared/api/userFields.js';
import { Toolbar } from '../../shared/ui.js';
import { fieldLabel, languageOf, optionLabel } from '../user-fields/model.js';
import { EMPTY_USER_FILTERS, USER_ROLES, USER_STATUSES, type AdminUsersFilters as Filters } from './model.js';

export function AdminUsersFilters({ filters, onChange, fields = [] }: { filters: Filters; onChange: (filters: Filters) => void; fields?: UserFieldView[] }) {
  const { t, i18n } = useTranslation();
  const language = languageOf(i18n.language);
  const chosen = fields.find((field) => field.key === filters.fieldKey);
  return <Toolbar className="admin-users-filters" left={<>
    <label className="admin-users-filter"><span>{t('admin.users.searchLabel', 'Search users')}</span><input type="search" value={filters.query} onChange={(e) => onChange({ ...filters, query: e.target.value })} /></label>
    <label className="admin-users-filter"><span>{t('admin.users.roleLabel', 'Role')}</span><select value={filters.role} onChange={(e) => onChange({ ...filters, role: e.target.value as Filters['role'] })}><option value="">{t('admin.users.allRoles', 'All roles')}</option>{USER_ROLES.map((role) => <option key={role} value={role}>{t(`admin.roles.options.${role}`, role)}</option>)}</select></label>
    <label className="admin-users-filter"><span>{t('admin.users.statusLabel', 'Status')}</span><select value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as Filters['status'] })}><option value="">{t('admin.users.allStatuses', 'All statuses')}</option>{USER_STATUSES.map((status) => <option key={status} value={status}>{t(`admin.users.status.${status}`, status)}</option>)}</select></label>
    {fields.length > 0 ? <label className="admin-users-filter"><span>{t('userFields.filterField')}</span><select value={filters.fieldKey ?? ''} onChange={(e) => onChange({ ...filters, fieldKey: e.target.value, fieldValue: '' })}><option value="">{t('userFields.filterAny')}</option>{fields.map((field) => <option key={field.key} value={field.key}>{fieldLabel(field, language)}</option>)}</select></label> : null}
    {chosen ? <label className="admin-users-filter"><span>{t('userFields.filterValue')}</span>{chosen.type === 'list' || chosen.type === 'boolean'
      ? <select value={filters.fieldValue ?? ''} onChange={(e) => onChange({ ...filters, fieldValue: e.target.value })}><option value="">—</option>{chosen.type === 'boolean' ? <><option value="true">{t('userFields.yes')}</option><option value="false">{t('userFields.no')}</option></> : (chosen.options ?? []).map((option) => <option key={option.key} value={option.key}>{optionLabel(option, language)}</option>)}</select>
      : <input type={chosen.type === 'date' ? 'date' : 'text'} value={filters.fieldValue ?? ''} onChange={(e) => onChange({ ...filters, fieldValue: e.target.value })} />}</label> : null}
  </>} right={<button className="admin-btn admin-btn--secondary" disabled={!filters.query && !filters.role && !filters.status && !filters.fieldKey} onClick={() => onChange(EMPTY_USER_FILTERS)} type="button">{t('admin.users.clearFilters', 'Clear filters')}</button>} />;
}
