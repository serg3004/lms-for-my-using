import { signJwt, verifyJwt } from './auth.tokens';

const jwtSecret = '0123456789abcdef0123456789abcdef';

describe('Auth tokens', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
      return;
    }

    process.env.JWT_SECRET = originalJwtSecret;
  });

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

  it('signs and verifies a JWT with the configured JWT secret', () => {
    process.env.JWT_SECRET = jwtSecret;

    const token = signJwt({
      sub: '22222222-2222-2222-2222-222222222222',
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
    });

    expect(verifyJwt(token).sub).toBe('22222222-2222-2222-2222-222222222222');
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
