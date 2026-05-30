import { createHmac, timingSafeEqual } from 'node:crypto';

import { getJwtSecret } from '../../config/env.js';

const jwtAlg = 'HS256';
const jwtTyp = 'JWT';
const defaultTokenExpiresInSeconds = 60 * 60;
const maxClockSkewInSeconds = 60;

export type JwtSignPayload = {
  sub: string;
  organizationId: string;
  email: string;
};

export type JwtClaims = JwtSignPayload & {
  iat: number;
  exp: number;
};

type JwtHeader = {
  alg: typeof jwtAlg;
  typ: typeof jwtTyp;
};

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

function parseJsonObject(input: string, errorMessage: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(base64UrlDecode(input));

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(errorMessage);
    }

    return value as Record<string, unknown>;
  } catch {
    throw new Error(errorMessage);
  }
}

function isJwtHeader(value: Record<string, unknown>): boolean {
  return value.alg === jwtAlg && value.typ === jwtTyp;
}

function isJwtClaims(value: Record<string, unknown>): value is JwtClaims {
  return (
    typeof value.sub === 'string' &&
    typeof value.organizationId === 'string' &&
    typeof value.email === 'string' &&
    Number.isInteger(value.iat) &&
    Number.isInteger(value.exp)
  );
}

export function signJwt(payload: JwtSignPayload, secret = getJwtSecret()) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: jwtAlg, typ: jwtTyp } satisfies JwtHeader));
  const claims: JwtClaims = { ...payload, iat: now, exp: now + defaultTokenExpiresInSeconds };
  const body = base64UrlEncode(JSON.stringify(claims));
  const signature = base64UrlEncode(sign(`${header}.${body}`, secret));

  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret = getJwtSecret()) {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT');
  }

  const [header, body, signature] = parts;

  if (!header || !body || !signature) {
    throw new Error('Invalid JWT');
  }

  const parsedHeader = parseJsonObject(header, 'Invalid JWT header');

  if (!isJwtHeader(parsedHeader)) {
    throw new Error('Invalid JWT header');
  }

  if (!hasValidSignature(`${header}.${body}`, signature, secret)) {
    throw new Error('Invalid JWT signature');
  }

  const claims = parseJsonObject(body, 'Invalid JWT claims');

  if (!isJwtClaims(claims)) {
    throw new Error('Invalid JWT claims');
  }

  const now = Math.floor(Date.now() / 1000);

  if (claims.iat > now + maxClockSkewInSeconds) {
    throw new Error('JWT issued in the future');
  }

  if (claims.exp <= now || claims.exp <= claims.iat) {
    throw new Error('JWT expired');
  }

  return claims as JwtClaims;
}
