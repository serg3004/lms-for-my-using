import { createHmac, timingSafeEqual } from 'node:crypto';

const jwtAlg= 'HS256';
const jwtType = 'JWT';
const jwtSecretMinLength = 32;
const defaultTokenExpiresInSeconds = 60 * 60;

export type JwtSignPayload = {
  sub: string;
  organizationId: string;
  email: string;
};

export type JwtClaims = JwtSignPayload & {
  iat: number;
  exp: number;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < jwtSecretMinLength) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  return secret;
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(input: string, secret: string) {
  return createHmac('sha256', secret).update(input).digest();
}

function hasValidSignature(signingInput: string, signature: string, secret: string) {
  const expectedSignature = sign(signingInput, secret);
  const actualSignature = Buffer.from(signature, 'base64url');

  return actualSignature.length === expectedSignature.length && timingSafeEqual(actualSignature, expectedSignature);
}

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const claims = value as Record<string, unknown>;

  return typeof claims.sub === 'string' && typeof claims.organizationId === 'string' && typeof claims.email === 'string' && typeof claims.iat === 'number' && typeof claims.exp === 'number';
}

export function signJwt(payload: JwtSignPayload, secret = getJwtSecret()) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: jwtAlg, typ: jwtType }));
  const claims: JwtClaims = { ...payload, iat: now, exp: now + defaultTokenExpiresInSeconds };
  const body = base64UrlEncode(JSON.stringify(claims));
  const signature = base64UrlEncode(sign(`${header}.${body}`, secret));

  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret = getJwtSecret()) {
  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) {
    throw new Error('Invalid JWT');
  }

  if (!hasValidSignature(`${header}.${body}`, signature, secret)) {
    throw new Error('Invalid JWT signature');
  }

  const claims: unknown = JSON.parse(base64UrlDecode(body));

  if (!isJwtClaims(claims) {
    throw new Error('Invalid JWT claims');
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired');
  }

  return claims;
}
