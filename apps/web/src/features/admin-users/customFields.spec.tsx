import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import '../../i18n/index.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { AdminUserForm } from './AdminUserForm.js';
import { exportRows } from './exportUsers.js';
import { toCreateUserPayload, toUpdateUserPayload } from './mappers.js';
import { EMPTY_USER_FORM, toEditUserForm, type AdminUserSummary } from './model.js';
import { usersUrl } from './useAdminUsers.js';

const labels = (ru: string) => ({ ru, en: ru, kk: ru, zh: ru });
const fields: UserFieldView[] = [
  { key: 'employee_number', labels: labels('Табельный номер'), type: 'text', required: true, unique: true, searchable: true, options: null, sortOrder: 1 },
  { key: 'work_schedule', labels: labels('График'), type: 'list', required: false, unique: false, searchable: false, options: [{ key: '5-2', labels: labels('5/2') }], sortOrder: 2 },
  { key: 'hire_date', labels: labels('Дата приёма'), type: 'date', required: false, unique: false, searchable: false, options: null, sortOrder: 3, editable: false },
];
const user: AdminUserSummary = {
  id: 'u1', organizationId: 'o1', email: 'a@x.kz', firstName: 'Анна', lastName: 'Ли', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru',
  timezone: 'Asia/Almaty', lastLoginAt: null, createdAt: '', updatedAt: '', memberships: [{ role: 'learner' }], customFields: { employee_number: '=cmd', work_schedule: '5-2', hire_date: '2026-01-02' },
};

describe('custom fields in the user form and list (PR 500)', () => {
  it('shows an input per field, the read-only one disabled, and the required marker', () => {
    const html = renderToStaticMarkup(<AdminUserForm fields={fields} form={{ ...EMPTY_USER_FORM, customFields: { work_schedule: '5-2' } }} mode="create" errors={{}} message={null} isSaving={false} onChange={() => undefined} onErrorsChange={() => undefined} onSubmit={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('Табельный номер *');
    expect(html).toContain('id="user-field-work_schedule"');
    expect(html).toContain('<option value="5-2" selected="">5/2</option>');
    expect(html).toMatch(/id="user-field-hire_date"[^>]*disabled/);
  });

  it('puts the typed values into the create payload and only the changes into the update payload', () => {
    const create = toCreateUserPayload({ ...EMPTY_USER_FORM, email: 'a@x.kz', firstName: 'A', lastName: 'B', customFields: { employee_number: 'T-1', work_schedule: '' } }, 'o1', fields);
    expect(create.customFields).toEqual({ employee_number: 'T-1' });
    const form = toEditUserForm(user);
    expect(toUpdateUserPayload(form, fields)).not.toHaveProperty('customFields');
    const changed = toUpdateUserPayload({ ...form, customFields: { ...form.customFields, work_schedule: '' } }, fields);
    expect(changed.customFields).toEqual({ work_schedule: null });
  });

  it('asks the server for search, status and the field filter, but not for the role', () => {
    expect(usersUrl(2, ' T-1 ', { query: '', role: 'learner', status: 'active', fieldKey: 'work_schedule', fieldValue: '5-2' })).toBe('/users?page=2&pageSize=20&search=T-1&status=active&fieldKey=work_schedule&fieldValue=5-2');
    expect(usersUrl(1, '', { query: '', role: '', status: '' })).toBe('/users?page=1&pageSize=20');
  });

  it('exports the standard columns and the chosen fields, with list titles and harmless formulas', () => {
    const rows = exportRows([user], fields.slice(0, 2), 'ru', { name: 'Имя', email: 'Почта', role: 'Роль', status: 'Статус', yes: 'Да', no: 'Нет', roleLabel: (role) => role, statusLabel: (status) => status });
    expect(rows[0]).toEqual(['Имя', 'Почта', 'Роль', 'Статус', 'Табельный номер', 'График']);
    expect(rows[1]).toEqual(['Ли Анна', 'a@x.kz', 'learner', 'active', "'=cmd", '5/2']);
  });
});
