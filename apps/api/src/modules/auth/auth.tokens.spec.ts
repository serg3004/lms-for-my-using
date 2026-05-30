import { createHmac } from 'node:crypto';

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

function base64UrlEncodeRaw(input: string) {
  return Buffer.from(input).toString('base64url');
}

function signTokenParts(header: unknown, body: unknown | string, isRawBody = false) {
  const encodedHeader = base64UrlEncode(header);
  const encodedBody = isRawBody ? base64UrlEncodeRaw(body as string) : base64UrlEncode(body);
  const signature = createHmac('sha256', jwtSecret).update(`${encodedHeader}.${encodedBody}`).digest('base64url');

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function expectSafeTokenError(token: string, expectedMessage: RegExp) {
  try {
    verifyJwt(token, jwtSecret);
    throw new Error('Expected JWT verification to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);

    const message = (error as Error).message;

    expect(message).toMatch(expectedMessage);
    expect(message).not.toMatch(/Unexpected|SyntaxError|position|JSON\.parse/);
  }
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

    expectSafeTokenError(`${header}.${body}.${signature}`, /Invalid JWT header/);
  });

  it('rejects a token with extra segments', () => {
    const token = signJwt(userJwtPayload, jwtSecret);

    expectSafeTokenError(`${token}.extra`, /Invalid JWT/);
  });

  it('rejects malformed JWT JSON without leaking parser errors', () => {
    expectSafeTokenError('not-json.body.signature', /Invalid JWT header/);
  });

  it('rejects malformed signed claims without leaking parser errors', () => {
    const token = signTokenParts({ alg: 'HS256', typ: 'JWT' }, 'not-json', true);

    expectSafeTokenError(token, /Invalid JWT claims/);
  });

  it('rejects signed claims with missing required fields', () => {
    const token = signTokenParts({ alg: 'HS256', typ: 'JWT' }, { sub: userJwtPayload.sub });

    expectSafeTokenError(token, /Invalid JWT claims/);
  });

  it('rejects signed claims with invalid token lifetime', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signTokenParts(
      { alg: 'HS256', typ: 'JWT' },
      {
        ...userJwtPayload,
        iat: now,
        exp: now,
      },
    );

    expectSafeTokenError(token, /JWT expired/);
  });
});
