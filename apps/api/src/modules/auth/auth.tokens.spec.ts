import { signJwt, verifyJwt } from './auth.tokens';

const jwtSecret = '0123456789abcdef0123456789abcdef';

describe('Auth tokens', () => {
  it('signs and verifies a JWT', () => {
    const token = signJwt(
      {
        sub: '22222222-2222-2222-2222-222222222222',
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
      },
      jwtSecret,
    );

    const claims = verifyJwt(token, jwtSecret);

    expect(claims.sub).toBe('22222222-2222-2222-2222-222222222222');
    expect(claims.organizationId).toBe('11111111-1111-1111-1111-111111111111');
    expect(claims.email).toBe('user@example.com');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt(
      {
        sub: '22222222-2222-2222-2222-222222222222',
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
      },
      jwtSecret,
    );

    expect(() => verifyJwt(token, 'abcdef0123456789abcdef0123456789')).toThrow();
  });
});
