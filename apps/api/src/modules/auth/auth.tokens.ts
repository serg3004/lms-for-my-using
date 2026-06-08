import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';

import { getJwtSecret } from '../../config/env.js';

const jwtAlg = 'HS256';
const defaultExpiresIn = '1h';
const defaultExpiresInMs = 60 * 60 * 1000;

export type JwtSignPayload = {
  sub: string;
  organizationId: string;
  email: string;
};

export type JwtClaims = JwtSignPayload & {
  jti: string;
  iat: number;
  exp: number;
};

export type SignJwtResult = {
  token: string;
  jti: string;
  expiresAt: Date;
};

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function hasValidClaims(payload: Record<string, unknown>): payload is JwtClaims {
  return (
    typeof payload.sub === 'string' &&
    typeof payload.organizationId === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.jti === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  );
}

function toJwtVerificationError(message: string, cause: unknown) {
  return new Error(message, { cause });
}

export async function signJwt(payload: JwtSignPayload, secret?: string): Promise<SignJwtResult> {
  const resolvedSecret = secret ?? getJwtSecret();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + defaultExpiresInMs);

  const token = await new SignJWT({ organizationId: payload.organizationId, email: payload.email })
    .setProtectedHeader({ alg: jwtAlg })
    .setSubject(payload.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(defaultExpiresIn)
    .sign(toKey(resolvedSecret));

  return { token, jti, expiresAt };
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
    if (error instanceof Error && error.message === 'Invalid JWT claims') {
      throw toJwtVerificationError('Invalid JWT claims', error);
    }

    if (error instanceof joseErrors.JWTExpired) {
      throw toJwtVerificationError('JWT expired', error);
    }

    if (error instanceof joseErrors.JOSEAlgNotAllowed) {
      throw toJwtVerificationError('Invalid JWT header', error);
    }

    if (error instanceof joseErrors.JWSInvalid) {
      const msg = error.message.toLowerCase();

      throw toJwtVerificationError(
        msg.includes('header') || msg.includes('protected') ? 'Invalid JWT header' : 'Invalid JWT',
        error,
      );
    }

    if (error instanceof joseErrors.JWTInvalid) {
      throw toJwtVerificationError('Invalid JWT claims', error);
    }

    throw toJwtVerificationError('Invalid JWT', error);
  }
}
