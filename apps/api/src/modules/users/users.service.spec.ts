import { createUserSchema } from './users.schemas';

describe('Users validation', () => {
  it('accepts valid user input', () => {
    const input = createUserSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'USER@Example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
  });

  it('rejects short user password', () => {
    expect(() =>
      createUserSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        password: 'short',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).toThrow();
  });
});
