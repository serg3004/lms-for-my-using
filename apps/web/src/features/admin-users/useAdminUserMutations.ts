import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import { passwordViolationMessages } from '../../shared/passwordPolicyErrors.js';
import type { FormValidationErrors } from '../../shared/formValidation.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { toCreateUserPayload, toUpdateUserPayload } from './mappers.js';
import type { InvitationResult, TemporaryPasswordResult } from './ResetPasswordDialogs.js';
import type { AdminUserSummary, UserForm, UserFormField, UserFormMode, UserStatusImpact } from './model.js';

export function useAdminUserMutations(reload: () => Promise<void>) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

  async function saveUser(form: UserForm, mode: UserFormMode, organizationId: string, fields: UserFieldView[] = []): Promise<{
    ok: boolean; invitation?: InvitationResult; temporary?: TemporaryPasswordResult; formErrors?: FormValidationErrors<UserFormField>; message?: string;
  }> {
    setIsSaving(true);
    try {
      let invited: InvitationResult | undefined;
      let temporary: TemporaryPasswordResult | undefined;
      if (mode === 'create') {
        const created = await apiRequest<AdminUserSummary & { invitation?: { delivered: boolean; inviteUrl?: string }; temporaryPassword?: { temporaryPassword: string; expiresAt: string } }>('/users', {
          method: 'POST', body: JSON.stringify(toCreateUserPayload(form, organizationId, fields)),
        });
        if (created.invitation) invited = { user: created, ...created.invitation };
        // PR 501: no mailbox and no password: the person activates themselves, so the administrator is told what to pass on.
        else if (form.noEmail && (form.noEmailAccess ?? 'identity') === 'identity') invited = { user: created, delivered: false, identity: true };
        if (created.temporaryPassword) temporary = { user: created, ...created.temporaryPassword };
      } else if (form.id) {
        await apiRequest<AdminUserSummary>(`/users/${form.id}`, {
          method: 'PATCH', body: JSON.stringify(toUpdateUserPayload(form, fields)),
        });
      }
      await reload();
      return { ok: true, ...(invited ? { invitation: invited } : {}), ...(temporary ? { temporary } : {}) };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409 && /another person/i.test(error.message)) {
        return { ok: false, message: t('userFields.duplicateValue') };
      }
      if (error instanceof ApiClientError && error.status === 409) {
        return { ok: false, formErrors: { email: t('admin.users.duplicateEmail', 'A user with this email already exists') } };
      }
      const violations = passwordViolationMessages(error, t);
      if (violations) return { ok: false, formErrors: { password: violations.join(' ') } };
      return { ok: false, message: error instanceof ApiClientError ? error.message : t('admin.users.saveFailed', 'Failed to save user. Try again.') };
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(user: AdminUserSummary) {
    try {
      await apiRequest(`/users/${user.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: user.status === 'active' ? 'suspended' : 'active' }),
      });
    } finally {
      await reload();
    }
  }

  /** PR 495: archives (after the administrator confirmed the impact) or restores; returns whether it worked. */
  async function setStatus(user: AdminUserSummary, status: 'archived' | 'active'): Promise<boolean> {
    try {
      await apiRequest(`/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify(status === 'archived' ? { status, confirm: true } : { status }) });
      return true;
    } catch {
      return false;
    } finally {
      await reload();
    }
  }

  /** PR 495: the full impact of archiving; `null` when the check itself fails (archiving is then not offered). */
  async function loadImpact(user: AdminUserSummary): Promise<UserStatusImpact | null> {
    try {
      return await apiRequest<UserStatusImpact>(`/users/${user.id}/status-impact`);
    } catch {
      return null;
    }
  }

  /** Issues a one-time reset link: emailed when mail works, otherwise returned once for the administrator to hand over. */
  async function resetPassword(user: AdminUserSummary) {
    return apiRequest<{ delivered: boolean; resetUrl?: string }>(`/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({}) });
  }

  /** PR 489: a temporary password for an active user; returned once. */
  async function issueTemporaryPassword(user: AdminUserSummary) {
    return apiRequest<{ temporaryPassword: string; expiresAt: string }>(`/users/${user.id}/temporary-password`, { method: 'POST', body: JSON.stringify({}) });
  }

  /** PR 346: unfinished observer sessions of the user; `null` when the check itself fails. */
  async function loadObserverSessions(user: AdminUserSummary): Promise<number | null> {
    try {
      return (await apiRequest<{ observerSessions: number }>(`/users/${user.id}/status-impact`)).observerSessions;
    } catch {
      return null;
    }
  }

  return { isSaving, saveUser, toggleStatus, setStatus, loadImpact, loadObserverSessions, resetPassword, issueTemporaryPassword };
}
