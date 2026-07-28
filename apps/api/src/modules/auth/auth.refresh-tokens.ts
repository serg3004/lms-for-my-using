import { createHash, randomBytes } from 'node:crypto';

const refreshTokenBytes = 32;

export function createRefreshToken() {
  const token = randomBytes(refreshTokenBytes).toString('base64url');

  return {
    token,
    hash: hashRefreshToken(token),
  };
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
