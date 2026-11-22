import { describe, expect, it } from 'vitest';

import { checkRowsLocally, tableToRows, toApiRow } from '../admin-users-import/importFile.js';
import { toCreateUserPayload } from './mappers.js';
import { EMPTY_USER_FORM, isNoEmail } from './model.js';
import { validateUserForm } from './validation.js';

const t = ((_key: string, fallback?: string) => fallback ?? '') as never;
const person = { ...EMPTY_USER_FORM, firstName: 'Айгуль', lastName: 'Каримова', customFields: {} };

describe('people without an email (PR 501)', () => {
  it('recognizes the placeholder address', () => {
    expect(isNoEmail('0b0a4c1e-aaaa-4bbb-8ccc-123456789abc@no-email.invalid')).toBe(true);
    expect(isNoEmail('aigul@example.com')).toBe(false);
  });

  it('creates without an email: by employee number or with a temporary password, never with a chosen password', () => {
    const identity = toCreateUserPayload({ ...person, noEmail: true, noEmailAccess: 'identity', password: 'typed-before', email: 'typed@before.test' }, 'org');
    expect(identity).toMatchObject({ activateByIdentity: true });
    expect(identity).not.toHaveProperty('email');
    expect(identity).not.toHaveProperty('password');
    expect(identity).not.toHaveProperty('temporaryPassword');
    const temporary = toCreateUserPayload({ ...person, noEmail: true, noEmailAccess: 'temporary' }, 'org');
    expect(temporary).toMatchObject({ temporaryPassword: true });
    expect(temporary).not.toHaveProperty('activateByIdentity');
    // Without a choice, the person activates themselves: no secret has to be handed over.
    expect(toCreateUserPayload({ ...person, noEmail: true }, 'org')).toMatchObject({ activateByIdentity: true });
  });

  it('keeps inviting by email when the box is off', () => {
    expect(toCreateUserPayload({ ...person, email: 'A@B.test' }, 'org')).toMatchObject({ email: 'a@b.test' });
  });

  it('does not ask for an email when the person has none', () => {
    expect(validateUserForm({ ...person, noEmail: true }, 'create', t)).toEqual({});
    expect(validateUserForm({ ...person }, 'create', t)).toHaveProperty('email');
  });
});

describe('import rows without an email (PR 501)', () => {
  const header = ['Почта', 'Фамилия', 'Имя', 'Активация по табельному номеру'];
  const table = (rows: string[][]) => ({ rows: [header, ...rows], formulaCells: new Set<string>() });

  it('reads the activation column in any language and sends the flag', () => {
    const parsed = tableToRows(table([['', 'Файл', 'Асем', 'да'], ['a@b.test', 'Иванов', 'Иван', '']]));
    if (!('rows' in parsed)) throw new Error('expected rows');
    expect(parsed.rows[0]?.activate).toBe(true);
    expect(parsed.rows[1]?.activate).toBeUndefined();
    expect(toApiRow(parsed.rows[0]!)).toEqual({ lastName: 'Файл', firstName: 'Асем', activateByIdentity: true });
    expect(toApiRow(parsed.rows[1]!)).toEqual({ email: 'a@b.test', lastName: 'Иванов', firstName: 'Иван' });
  });

  it('asks for an email only where the row does not activate by number', () => {
    const parsed = tableToRows(table([['', 'Файл', 'Асем', 'yes'], ['', 'Без', 'Почты', '']]));
    if (!('rows' in parsed)) throw new Error('expected rows');
    const checked = checkRowsLocally(parsed.rows, (column) => column);
    expect(checked[0]?.problems).toEqual([]);
    expect(checked[1]?.problems).toEqual([{ key: 'required', params: { fields: 'email' } }]);
  });
});
