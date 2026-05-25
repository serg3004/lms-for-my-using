import { loginSchema } from './auth.schemas';

describe('Auth validation', () => {
  it('accepts valid login input', () => {
    const input = loginSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'USER@Example.com',
      password: 'secret-password',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      password: 'secret-password',
    });
  });

  it('rejects empty login password', () => {
    expect(() =>
      loginSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        password: '',
      }),
    ).toThrow();
  });
});
