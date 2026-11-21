import type { UserForm } from './model.js';

const optional = (value: string) => value.trim() || undefined;

export function toCreateUserPayload(form: UserForm, organizationId: string) {
  return {
    organizationId,
    ...(form.role ? { role: form.role } : {}),
    ...(form.departmentId ? { departmentId: form.departmentId } : {}),
    email: form.email.trim().toLowerCase(),
    // Empty password = invite by email (PR 487): the user sets their own through a one-time link.
    ...(form.password ? { password: form.password } : {}),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    middleName: optional(form.middleName),
  };
}

export function toUpdateUserPayload(form: UserForm) {
  return {
    email: form.email.trim().toLowerCase(), firstName: form.firstName.trim(), lastName: form.lastName.trim(),
    middleName: optional(form.middleName), position: optional(form.position), shift: optional(form.shift),
    phone: optional(form.phone), status: form.status, locale: form.locale.trim(), timezone: form.timezone.trim(),
    role: form.role || null,
  };
}
