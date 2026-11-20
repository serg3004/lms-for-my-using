import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { assignCustomRole, revokeCustomRole, type RoleAssignment } from '../../shared/api/customRoles.js';

export type PickableUser = { id: string; label: string };

type Props = { roleId: string; assignments: RoleAssignment[]; users: PickableUser[]; disabled: boolean; onChanged: () => Promise<void> };

/** PR 485: who holds the role, with assign and revoke. The change counts from the user's next request. */
export function RoleAssignments({ roleId, assignments, users, disabled, onChanged }: Props) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const free = users.filter((user) => !assignments.some((assignment) => assignment.userId === user.id));

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await onChanged(); setUserId(''); }
    catch (failure) {
      setError(failure instanceof ApiClientError && failure.status === 404 ? t('customRoles.assignNotFound', 'The user or the role was not found. Reload the page.') : t('customRoles.assignFailed', 'Could not change the assignment. Try again.'));
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="role-assignments-title" style={{ display: 'grid', gap: 8 }}>
    <h3 id="role-assignments-title" style={{ margin: 0 }}>{t('customRoles.assignmentsTitle', 'Users with this role')}</h3>
    {assignments.length === 0 ? <p className="admin-form__hint" style={{ margin: 0 }}>{t('customRoles.assignmentsEmpty', 'The role is not assigned to anyone yet.')}</p> : <ul className="admin-membership-list">
      {assignments.map((assignment) => <li key={assignment.userId}>
        <span>{`${assignment.lastName} ${assignment.firstName}`.trim()} · {assignment.email}</span>
        <button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busy || disabled} onClick={() => void run(() => revokeCustomRole(roleId, assignment.userId))} type="button">{t('customRoles.revoke', 'Revoke')}</button>
      </li>)}
    </ul>}
    {disabled ? null : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <select aria-label={t('customRoles.pickUser', 'User to assign')} style={{ flex: '1 1 220px', minWidth: 0 }} value={userId} onChange={(event) => setUserId(event.target.value)}>
        <option value="">{t('customRoles.pickUserPlaceholder', 'Choose a user')}</option>
        {free.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
      </select>
      <button className="admin-btn admin-btn--primary" disabled={busy || !userId} onClick={() => void run(() => assignCustomRole(roleId, userId))} type="button">{t('customRoles.assign', 'Assign')}</button>
    </div>}
    {error ? <p className="admin-form__error" role="alert">{error}</p> : null}
  </section>;
}
