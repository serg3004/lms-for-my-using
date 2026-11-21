import { randomInt } from 'node:crypto';

import { checkPassword, type PasswordPolicy, type PasswordSubject } from './password-policy.js';

/** PR 489: a temporary password lives seven days and works for one sign-in that leads only to the forced change. */
export const temporaryPasswordLifetimeMs = 7 * 24 * 60 * 60 * 1000;

// No look-alike characters (0/O, 1/l/I), so the password can be read out or typed from a printed sheet.
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const digits = '23456789';
const length = 12;

const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)]!;

/** Random password that satisfies the organization's policy (at least 12 characters, letters and digits); never stored in clear text. */
export function generateTemporaryPassword(policy: PasswordPolicy, subject: PasswordSubject = {}): string {
  const size = Math.max(length, policy.minLength);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const chars = [pick(letters), pick(digits)];
    while (chars.length < size) chars.push(pick(letters + digits));
    for (let index = chars.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [chars[index], chars[other]] = [chars[other]!, chars[index]!];
    }
    const password = chars.join('');
    if (checkPassword(password, policy, subject).length === 0) return password;
  }
  throw new Error('Could not generate a temporary password');
}
