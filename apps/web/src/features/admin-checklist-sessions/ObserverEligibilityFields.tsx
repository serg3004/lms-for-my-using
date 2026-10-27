import { useEffect, useId, useState } from 'react';
import { USER_ROLES } from '@lms/shared/constants/roles';
import type { TFunction } from 'i18next';

import { listUsers } from '../../shared/api/users.js';
import type { ChecklistWorkplaceSettingsView, UserSummary } from '../../shared/api/types.js';
import { Button, Input, Select } from '../../shared/ui.js';

type Props = {
  settings: ChecklistWorkplaceSettingsView;
  onChange: (patch: Partial<ChecklistWorkplaceSettingsView>) => void;
  t: TFunction;
};

export function ObserverEligibilityFields({ settings, onChange, t }: Props) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const pageSize = 20;
  const selectedIds = new Set(settings.observerUserIds);
  const selectedPeople = (settings.selectedObserverUsers ?? []).filter((user) => selectedIds.has(user.id));
  const namedIds = new Set(selectedPeople.map((user) => user.id));
  const hasUnavailable = settings.observerUserIds.some((id) => !namedIds.has(id));

  useEffect(() => {
    if (settings.observerEligibility !== 'selected_users') return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      listUsers({ status: 'active', search: search.trim() || undefined, page, pageSize })
        .then((response) => { if (!cancelled) { setResults(response.items); setTotal(response.total); } })
        .catch(() => { if (!cancelled) { setFailed(true); setResults([]); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [settings.observerEligibility, search, page, retry]);

  function toggleUser(user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'status'>) {
    const selected = settings.observerUserIds.includes(user.id);
    onChange({
      observerUserIds: selected ? settings.observerUserIds.filter((value) => value !== user.id) : [...settings.observerUserIds, user.id],
      selectedObserverUsers: selected
        ? settings.selectedObserverUsers?.filter((value) => value.id !== user.id)
        : [...(settings.selectedObserverUsers ?? []), user],
    });
  }

  return (
    <fieldset className="admin-form__field" style={{ minWidth: 0 }}>
      <legend>{t('admin.checklists.settings.observers.title')}</legend>
      <Select
        label={t('admin.checklists.settings.observers.mode')}
        value={settings.observerEligibility}
        onChange={(e) => onChange({ observerEligibility: e.target.value as ChecklistWorkplaceSettingsView['observerEligibility'] })}
      >
        <option value="any_user">{t('admin.checklists.settings.observers.anyUser')}</option>
        <option value="selected_roles">{t('admin.checklists.settings.observers.selectedRoles')}</option>
        <option value="selected_users">{t('admin.checklists.settings.observers.selectedUsers')}</option>
      </Select>
      <p className="admin-form__hint">{t('admin.checklists.settings.observers.futureOnly')}</p>
      {settings.observerEligibility === 'selected_roles' && (
        <fieldset style={{ minWidth: 0 }}>
          <legend>{t('admin.checklists.settings.observers.roles')}</legend>
          <ul className="ds-wizard-dialog__picklist">
          {USER_ROLES.map((role) => (
            <li key={role}><label>
              <input type="checkbox" checked={settings.observerRoles.includes(role)} onChange={() => onChange({
                observerRoles: settings.observerRoles.includes(role) ? settings.observerRoles.filter((value) => value !== role) : [...settings.observerRoles, role],
              })} />{' '}{t(`admin.checklists.settings.observers.roleLabels.${role}`)}
            </label></li>
          ))}
          </ul>
          {!settings.observerRoles.length && <p className="admin-form__hint">{t('admin.checklists.settings.observers.nobody')}</p>}
        </fieldset>
      )}
      {settings.observerEligibility === 'selected_users' && (
        <>
          <fieldset style={{ minWidth: 0 }}>
            <legend>{t('admin.checklists.settings.observers.chosen', { count: settings.observerUserIds.length })}</legend>
            <ul className="ds-wizard-dialog__picklist">
            {selectedPeople.map((user) => (
              <li key={user.id}><label style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                <input type="checkbox" checked onChange={() => toggleUser(user)} />{' '}
                {user.firstName} {user.lastName} ({user.email})
                {user.status !== 'active' && <> — {t('admin.checklists.settings.observers.inactive')}</>}
              </label></li>
            ))}
            </ul>
            {hasUnavailable && (
              <Button type="button" variant="secondary" onClick={() => onChange({
                observerUserIds: settings.observerUserIds.filter((id) => namedIds.has(id)),
              })}>
                {t('admin.checklists.settings.observers.removeUnavailable')}
              </Button>
            )}
            {!settings.observerUserIds.length && <p className="admin-form__hint">{t('admin.checklists.settings.observers.nobody')}</p>}
          </fieldset>
          <Input id={`${id}-search`} label={t('admin.checklists.settings.observers.search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          {loading && <p role="status">{t('admin.checklists.settings.observers.loading')}</p>}
          {failed && <>
            <p role="alert">{t('admin.checklists.settings.observers.loadError')}</p>
            <Button type="button" variant="secondary" onClick={() => setRetry((value) => value + 1)}>{t('admin.checklists.settings.observers.retry')}</Button>
          </>}
          {!loading && !failed && <>
            {!results.length && <p>{t('admin.checklists.settings.observers.empty')}</p>}
            <ul className="ds-wizard-dialog__picklist">
            {results.filter((user) => !settings.observerUserIds.includes(user.id)).map((user) => (
              <li key={user.id}><label style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                <input type="checkbox" checked={false} disabled={settings.observerUserIds.length >= 500} onChange={() => toggleUser(user)} />{' '}
                {user.firstName} {user.lastName} ({user.email})
              </label></li>
            ))}
            </ul>
            <div className="ds-dialog__actions" style={{ flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t('admin.checklists.settings.observers.previous')}</Button>
              <span>{t('admin.checklists.settings.observers.page', { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}</span>
              <Button type="button" variant="secondary" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>{t('admin.checklists.settings.observers.next')}</Button>
            </div>
          </>}
          {settings.observerUserIds.length >= 500 && <p>{t('admin.checklists.settings.observers.limit')}</p>}
        </>
      )}
    </fieldset>
  );
}
