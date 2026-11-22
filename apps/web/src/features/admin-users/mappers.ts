import type { UserFieldView } from '../../shared/api/userFields.js';
import { customFieldsPayload } from '../user-fields/model.js';
import type { UserForm } from './model.js';

const optional = (value: string) => value.trim() || undefined;

export function toCreateUserPayload(form: UserForm, organizationId: string, fields: UserFieldView[] = []) {
  const customFields = customFieldsPayload(fields, form.customFields);
  return {
    ...(customFields ? { customFields } : {}),
    organizationId,
    ...(form.role ? { role: form.role } : {}),
    ...(form.departmentId ? { departmentId: form.departmentId } : {}),
    // PR 501: without a mailbox there is no email and no invitation: the person activates by number or gets a temporary password.
    ...(form.noEmail ? { ...((form.noEmailAccess ?? 'identity') === 'identity' ? { activateByIdentity: true } : { temporaryPassword: true }) } : {
      email: form.email.trim().toLowerCase(),
      // Empty password = invite by email (PR 487): the user sets their own through a one-time link.
      ...(form.password ? { password: form.password } : form.temporaryPassword ? { temporaryPassword: true } : {}),
    }),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    middleName: optional(form.middleName),
  };
}

export function toUpdateUserPayload(form: UserForm, fields: UserFieldView[] = []) {
  const customFields = customFieldsPayload(fields, form.customFields, form.customFieldsOriginal ?? {});
  return {
    ...(customFields ? { customFields } : {}),
    email: form.email.trim().toLowerCase(), firstName: form.firstName.trim(), lastName: form.lastName.trim(),
    middleName: optional(form.middleName), position: optional(form.position), shift: optional(form.shift),
    phone: optional(form.phone), status: form.status, locale: form.locale.trim(), timezone: form.timezone.trim(),
    role: form.role || null,
  };
}
