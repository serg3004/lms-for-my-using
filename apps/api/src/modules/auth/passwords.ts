import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const passwordHashPrefix = 'scrypt';
const saltBytes = 16;
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes).toString('hex');
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return `${passwordHashPrefix}:${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, salt, storedKey] = passwordHash.split(':');

  if (algorithm !== passwordHashPrefix || !salt || !storedKey) {
    return false;
  }

  const storedKeyBuffer = Buffer.from(storedKey, 'hex');
  const derivedKey = (await scrypt(password, salt, storedKeyBuffer.length)) as Buffer;

  if (storedKeyBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKeyBuffer, derivedKey);
}
