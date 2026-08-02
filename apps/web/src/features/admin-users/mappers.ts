import type { UserForm } from './model.js';

const optional = (value: string) => value.trim() || undefined;

export function toCreateUserPayload(form: UserForm, organizationId: string) {
  return {
    organizationId,
    email: form.email.trim().toLowerCase(),
    password: form.password,
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
