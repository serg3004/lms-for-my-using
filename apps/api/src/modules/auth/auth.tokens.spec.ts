import { signJwt, verifyJwt } from './auth.tokens';

const jwtSecret = '0123456789abcdef0123456789abcdef';

const userJwtPayload = {
  sub: '22222222-2222-2222-2222-222222222222',
  organizationId: '11111111-1111-1111-1111-111111111111',
  email: 'user@example.com',
};

function base64UrlEncode(input: unknown) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

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
    const token = signJwt(userJwtPayload, jwtSecret);

    const claims = verifyJwt(token, jwtSecret);

    expect(claims.sub).toBe(userJwtPayload.sub);
    expect(claims.organizationId).toBe(userJwtPayload.organizationId);
    expect(claims.email).toBe(userJwtPayload.email);
  });

  it('signs and verifies a JWT with the configured JWT secret', () => {
    process.env.JWT_SECRET = jwtSecret;

    const token = signJwt(userJwtPayload);

    expect(verifyJwt(token).sub).toBe(userJwtPayload.sub);
  });

  it('fails signing when the configured JWT secret is missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => signJwt(userJwtPayload)).toThrow(/JWT_SECRET/);
  });

  it('fails verification when the configured JWT secret is too short', () => {
    process.env.JWT_SECRET = 'short-secret';
    const token = signJwt(userJwtPayload, jwtSecret);

    expect(() => verifyJwt(token)).toThrow(/JWT_SECRET/);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt(userJwtPayload, jwtSecret);

    expect(() => verifyJwt(token, 'abcdef0123456789abcdef0123456789')).toThrow();
  });

  it('rejects a token with an unsupported header', () => {
    const token = signJwt(userJwtPayload, jwtSecret);
    const [, body, signature] = token.split('.');
    const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });

    expect(() => verifyJwt(`${header}.${body}.${signature}`, jwtSecret)).toThrow(/Invalid JWT header/);
  });

  it('rejects a token with extra segments', () => {
    const token = signJwt(userJwtPayload, jwtSecret);

    expect(() => verifyJwt(`${token}.extra`, jwtSecret)).toThrow(/Invalid JWT/);
  });

  it('rejects malformed JWT JSON without leaking parser errors', () => {
    expect(() => verifyJwt('not-json.body.signature', jwtSecret)).toThrow(/Invalid JWT header/);
  });
});
