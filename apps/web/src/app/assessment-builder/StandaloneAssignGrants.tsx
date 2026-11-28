import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { searchAssessmentFolderShareCandidates } from '../../shared/api/assessmentFolders.js';
import { apiRequest } from '../../shared/apiClient.js';

type Person = { id: string; name: string };
type Grants = { roles: string[]; users: Person[] };
const roles = ['manager', 'instructor'] as const;

/**
 * PR 584: the author (and the administrator) choose who else may assign the test and manage its link, besides the
 * defaults: managers assign to their own team. The server answers 403 to everyone else, and then nothing is shown.
 */
export function StandaloneAssignGrants({ root }: { root: string }) {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<Grants | null>(null);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<Grants>(`${root}/grants`).then((value) => { if (active) setGrants(value); }, () => undefined);
    return () => { active = false; };
  }, [root]);

  useEffect(() => {
    if (term.trim().length < 2) { setFound([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      void searchAssessmentFolderShareCandidates(term.trim()).then((users) => { if (active) setFound(users); }).catch(() => { if (active) setFound([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [term]);

  if (!grants) return null;
  async function save() {
    if (!grants) return;
    setBusy(true);
    try {
      const saved = await apiRequest<Grants>(`${root}/grants`, {
        method: 'PUT', body: JSON.stringify({ roles: grants.roles, userIds: grants.users.map(({ id }) => id) }),
      });
      setGrants(saved);
      setMessage(t('assessments.standalone.grants.saved'));
    } catch {
      setMessage(t('assessments.standalone.error'));
    } finally {
      setBusy(false);
    }
  }

  return <fieldset className="admin-form" disabled={busy}>
    <legend>{t('assessments.standalone.grants.title')}</legend>
    <p className="admin-form__hint">{t('assessments.standalone.grants.hint')}</p>
    {roles.map((role) => <label key={role} className="admin-checkbox-field">
      <input type="checkbox" checked={grants.roles.includes(role)} onChange={(event) =>
        setGrants({ ...grants, roles: event.target.checked ? [...grants.roles, role] : grants.roles.filter((item) => item !== role) })} />
      {t(`assessments.standalone.grants.role.${role}`)}
    </label>)}
    <label className="admin-field">{t('assessments.standalone.grants.find')}
      <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} />
    </label>
    {found.filter((person) => !grants.users.some(({ id }) => id === person.id)).map((person) =>
      <button key={person.id} type="button" className="admin-btn" onClick={() => { setGrants({ ...grants, users: [...grants.users, person] }); setTerm(''); }}>+ {person.name}</button>)}
    <ul>{grants.users.map((person) => <li key={person.id}>{person.name}{' '}
      <button type="button" className="admin-btn" aria-label={t('assessments.standalone.grants.remove', { name: person.name })}
        onClick={() => setGrants({ ...grants, users: grants.users.filter(({ id }) => id !== person.id) })}>×</button></li>)}</ul>
    <button type="button" className="admin-btn" onClick={() => void save()}>{t('assessments.standalone.grants.save')}</button>
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
