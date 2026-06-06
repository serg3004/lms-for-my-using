import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';

import { getJwtSecret } from '../../config/env.js';

const jwtAlg = 'HS256';
const defaultExpiresIn = '1h';

export type JwtSignPayload = {
  sub: string;
  organizationId: string;
  email: string;
};

export type JwtClaims = JwtSignPayload & {
  iat: number;
  exp: number;
};

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function hasValidClaims(payload: Record<string, unknown>): payload is JwtClaims {
  return (
    typeof payload.sub === 'string' &&
    typeof payload.organizationId === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  );
}

export async function signJwt(payload: JwtSignPayload, secret?: string): Promise<string> {
  const resolvedSecret = secret ?? getJwtSecret();

  return new SignJWT({ organizationId: payload.organizationId, email: payload.email })
    .setProtectedHeader({ alg: jwtAlg })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(defaultExpiresIn)
    .sign(toKey(resolvedSecret));
}

export async function verifyJwt(token: string, secret?: string): Promise<JwtClaims> {
  const resolvedSecret = secret ?? getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, toKey(resolvedSecret), { algorithms: [jwtAlg] });

    if (!hasValidClaims(payload as Record<string, unknown>)) {
      throw new Error('Invalid JWT claims');
    }

    return payload as unknown as JwtClaims;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid JWT claims') throw error;
    if (error instanceof joseErrors.JWTExpired) throw new Error('JWT expired');
    if (error instanceof joseErrors.JOSEAlgNotAllowed) throw new Error('Invalid JWT header');
    if (error instanceof joseErrors.JWSInvalid) {
      const msg = error.message.toLowerCase();
      throw new Error(msg.includes('header') || msg.includes('protected') ? 'Invalid JWT header' : 'Invalid JWT');
    }
    if (error instanceof joseErrors.JWTInvalid) throw new Error('Invalid JWT claims');
    throw new Error('Invalid JWT');
  }
}
