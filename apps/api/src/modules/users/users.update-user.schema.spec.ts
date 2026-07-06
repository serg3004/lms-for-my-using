import { updateUserSchema } from './users.schemas.js';

describe('updateUserSchema', () => {
  it('accepts editable user profile and role fields', () => {
    const input = updateUserSchema.parse({
      email: 'EDITED@Example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      middleName: 'Byron',
      position: 'Instructor',
      shift: 'Day',
      phone: '+77001234567',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
      role: 'instructor',
    });

    expect(input).toEqual({
      email: 'edited@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      middleName: 'Byron',
      position: 'Instructor',
      shift: 'Day',
      phone: '+77001234567',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
      role: 'instructor',
    });
  });

  it('rejects invalid editable user role', () => {
    expect(() =>
      updateUserSchema.parse({
        email: 'edited@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        status: 'active',
        locale: 'ru',
        timezone: 'Asia/Almaty',
        role: 'owner',
      }),
    ).toThrow();
  });
});
