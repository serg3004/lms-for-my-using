import { currentUserSchema, loginResponseSchema, loginSchema } from './auth.schemas';

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

  it('accepts current user with position and shift', () => {
    const currentUser = currentUserSchema.parse({
      id: '22222222-2222-2222-2222-222222222222',
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      middleName: null,
      position: 'Instructor',
      shift: 'Day',
      phone: null,
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });

    expect(currentUser.position).toBe('Instructor');
    expect(currentUser.shift).toBe('Day');
  });

  it('accepts login response with bearer token', () => {
    const response = loginResponseSchema.parse({
      accessToken: 'token',
      tokenType: 'Bearer',
      user: {
        id: '22222222-2222-2222-2222-222222222222',
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        middleName: null,
        position: 'Instructor',
        shift: 'Day',
        phone: null,
        status: 'active',
        locale: 'ru',
        timezone: 'Asia/Almaty',
      },
    });

    expect(response.tokenType).toBe('Bearer');
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
