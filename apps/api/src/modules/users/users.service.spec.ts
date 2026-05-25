import { createUserSchema } from './users.schemas.js';

describe('Users validation', () => {
  it('accepts valid user input', () => {
    const input = createUserSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'USER@Example.com',
      passwordHash: 'hashed-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
  });

  it('rejects invalid user email', () => {
    expect(() =>
      createUserSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'not-an-email',
        passwordHash: 'hashed-password',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).toThrow();
  });
});
