import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { changePassword } from './api/auth.js';
import { getPasswordPolicy } from './api/organizations.js';
import { ApiClientError } from './apiClient.js';
import { passwordViolationMessages } from './passwordPolicyErrors.js';
import { PasswordInput } from './PasswordInput.js';
import { useSession } from './session.js';

/** PR 488: a user changes their own password; the rules come from the organization's policy and are checked by the server. */
export function ChangePasswordForm({ className = 'learner-profile__card', onChanged }: { className?: string; onChanged?: () => void }) {
  const { t } = useTranslation();
  const { currentUser } = useSession();
  const [minLength, setMinLength] = useState<number | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');

  useEffect(() => {
    if (!currentUser) return;
    void getPasswordPolicy(currentUser.organizationId).then((policy) => setMinLength(policy.minLength)).catch(() => undefined);
  }, [currentUser]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState('idle');
    if (!currentPassword || !newPassword || !confirmation) return setProblems([t('security.required')]);
    if (newPassword !== confirmation) return setProblems([t('security.mismatch')]);
    setProblems([]);
    setState('saving');
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setState('done');
      onChanged?.();
    } catch (error) {
      setState('idle');
      const violations = passwordViolationMessages(error, t);
      if (violations) setProblems(violations);
      else if (error instanceof ApiClientError && error.status === 401) setProblems([t('security.wrongCurrent')]);
      else setProblems([t('security.changeError')]);
    }
  }

  return (
    <form className={className} onSubmit={(event) => void submit(event)}>
      <h2>{t('security.changeTitle')}</h2>
      <p>{t('security.changeHint')}</p>
      <label htmlFor="change-current-password">{t('security.currentPassword')}</label>
      <PasswordInput id="change-current-password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      <label htmlFor="change-new-password">{t('security.newPassword')}</label>
      <PasswordInput id="change-new-password" autoComplete="new-password" aria-describedby="change-password-requirements" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      {minLength ? <p id="change-password-requirements">{t('security.requirements', { count: minLength })}</p> : null}
      <label htmlFor="change-confirm-password">{t('security.confirmPassword')}</label>
      <PasswordInput id="change-confirm-password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {problems.length ? <ul role="alert">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
      {state === 'done' ? <p role="status">{t('security.changed')}</p> : null}
      <div className="learner-profile__actions">
        <button disabled={state === 'saving'} type="submit">{state === 'saving' ? t('security.changing') : t('security.change')}</button>
      </div>
    </form>
  );
}
