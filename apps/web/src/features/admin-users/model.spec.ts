import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import '../../i18n/index.js';
import { EMPTY_USER_FORM, toEditUserForm, withoutPassword, type AdminUserSummary } from './model.js';
import { toCreateUserPayload, toUpdateUserPayload } from './mappers.js';
import { validateUserForm } from './validation.js';

const user: AdminUserSummary = {
  id: 'u1', organizationId: 'o1', email: 'user@example.com', firstName: 'Ada', lastName: 'Lovelace',
  middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC',
  lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', memberships: [{ role: 'admin' }],
};

describe('admin users model', () => {
  it('maps a user to an edit form without a password', () => expect(toEditUserForm(user)).toMatchObject({ id: 'u1', password: '', role: 'admin', middleName: '' }));
  it('removes the password without changing non-sensitive fields', () => expect(withoutPassword({ ...EMPTY_USER_FORM, email: 'kept@example.com', password: 'Secret123!' })).toMatchObject({ email: 'kept@example.com', password: '' }));
  it('validates create fields and password strength', () => expect(validateUserForm({ ...EMPTY_USER_FORM, email: 'bad', password: 'short' }, 'create', i18next.t)).toEqual({ lastName: 'Укажите фамилию', firstName: 'Укажите имя', email: 'Введите корректный email', password: 'Пароль должен быть не короче 8 символов' }));
  it('does not require a password while editing', () => expect(validateUserForm(toEditUserForm(user), 'edit', i18next.t)).toEqual({}));
});

describe('admin users payload mappers', () => {
  const form = { ...toEditUserForm(user), email: ' USER@Example.COM ', firstName: ' Ada ', middleName: ' ' };
  it('normalizes create payloads', () => expect(toCreateUserPayload({ ...form, password: 'Secret123!' }, 'o1')).toEqual({ organizationId: 'o1', email: 'user@example.com', password: 'Secret123!', firstName: 'Ada', lastName: 'Lovelace', middleName: undefined }));
  it('maps optional update values and role', () => expect(toUpdateUserPayload(form)).toMatchObject({ email: 'user@example.com', middleName: undefined, position: undefined, role: 'admin' }));
});
