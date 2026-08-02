import { useState } from 'react';

import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import type { FormValidationErrors } from '../../shared/formValidation.js';
import { toCreateUserPayload, toUpdateUserPayload } from './mappers.js';
import type { AdminUserSummary, UserForm, UserFormField, UserFormMode } from './model.js';

const DUPLICATE_EMAIL_MESSAGE = 'A user with this email already exists';

export function useAdminUserMutations(reload: () => Promise<void>) {
  const [isSaving, setIsSaving] = useState(false);

  async function saveUser(form: UserForm, mode: UserFormMode, organizationId: string): Promise<{
    ok: boolean; formErrors?: FormValidationErrors<UserFormField>; message?: string;
  }> {
    setIsSaving(true);
    try {
      if (mode === 'create') {
        const created = await apiRequest<AdminUserSummary>('/users', {
          method: 'POST', body: JSON.stringify(toCreateUserPayload(form, organizationId)),
        });
        if (form.role) await apiRequest('/memberships', {
          method: 'POST', body: JSON.stringify({ organizationId, userId: created.id, role: form.role }),
        });
      } else if (form.id) {
        await apiRequest<AdminUserSummary>(`/users/${form.id}`, {
          method: 'PATCH', body: JSON.stringify(toUpdateUserPayload(form)),
        });
      }
      await reload();
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        return { ok: false, formErrors: { email: DUPLICATE_EMAIL_MESSAGE } };
      }
      return { ok: false, message: error instanceof ApiClientError ? error.message : 'Failed to save user. Try again.' };
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

  return { isSaving, saveUser, toggleStatus };
}
