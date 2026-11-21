import { BadRequestException } from '@nestjs/common';

/** PR 488: one password policy for every place that sets a password (create, invitation, reset, change, import). */
export const passwordMinLengthRange = { min: 5, max: 20, default: 10 } as const;
export const passwordHistoryRange = { min: 0, max: 10, default: 3 } as const;
export const passwordMaxLength = 255;

export type PasswordPolicy = { minLength: number; historyCount: number };

export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: passwordMinLengthRange.default,
  historyCount: passwordHistoryRange.default,
};

export type PasswordViolation = 'too_short' | 'no_letter' | 'no_digit' | 'too_long' | 'contains_email' | 'contains_name' | 'common' | 'reused';

export type PasswordSubject = { email?: string | null; firstName?: string | null; lastName?: string | null; middleName?: string | null };

/** The most used passwords (English, Russian transliteration and keyboard-layout classics), checked locally in lower case. */
const commonPasswords = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'qwerty', 'qwerty1', 'qwerty12', 'qwerty123', 'qwerty1234',
  'qwertyuiop', 'qwerty12345', 'qazwsx123', '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e', 'q1w2e3r4', 'q1w2e3r4t5', 'zaq12wsx', 'asdfgh123', 'asdf1234',
  'abc12345', 'abcd1234', 'abc123456', 'abcd12345', 'abcde12345', 'admin123', 'admin1234', 'admin12345', 'administrator1', 'root1234', 'welcome1', 'welcome123',
  'letmein1', 'letmein123', 'iloveyou1', 'iloveyou123', 'monkey123', 'dragon123', 'football1', 'football123', 'baseball1', 'master123', 'sunshine1', 'princess1',
  'shadow123', 'superman1', 'trustno1', 'login123', 'user1234', 'test1234', 'test12345', 'testtest1', 'changeme1', 'changeme123', 'default123', 'guest1234',
  'pass1234', 'pass12345', 'passwd123', 'secret123', 'secret1234', 'hello123', 'hello1234', 'freedom1', 'whatever1', 'qweasd123', 'qweasdzxc1', 'zxcvbnm123',
  'zxcvbn123', 'qwe123qwe', 'qwe12345', 'qwe123456', 'asd123456', 'zxc123456', 'iloveyou2', 'a1b2c3d4', 'a1b2c3d4e5', 'abcdef123', 'abcdefg123', 'abcdefgh1',
  'parol123', 'parol1234', 'parol12345', 'пароль123', 'пароль1234', 'пароль12345', 'qwerty123456', 'йцукен123', 'йцукен1234', 'йцукенг123', 'привет123', 'привет1234',
  'admin2020', 'admin2021', 'admin2022', 'admin2023', 'admin2024', 'admin2025', 'admin2026', 'password2020', 'password2021', 'password2022', 'password2023', 'password2024', 'password2025',
  'password2026', 'qwerty2020', 'qwerty2021', 'qwerty2022', 'qwerty2023', 'qwerty2024', 'qwerty2025', 'qwerty2026', 'learnspace1', 'learnspace123', 'company123', 'company1234', 'lms12345',
  'kazakhstan1', 'almaty123', 'astana123', 'moskva123', 'zxcv1234', 'zxcvbnm1', 'zxcvbnm12', 'asdfghjk1', 'asdfghjkl1', '123456a', '123456aa', '1234567a', '12345678a', 'a123456', 'a1234567', 'a12345678',
  'aa123456', 'aaa12345', 'abc1234', 'abc123', 'qwe123', 'zxc123', 'asd123', 'pass123', 'test123', 'user123', 'admin1', 'admin12', 'welcome12', 'monkey12', 'dragon12', 'qaz123', 'wsx123',
]);

const lowerTrim = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** A word counts when the password equals it, or contains it and it is long enough not to hit by accident. */
function matches(password: string, word: string) {
  return word.length > 0 && (password === word || (word.length >= 4 && password.includes(word)));
}

/** Rules that need only the password itself, the policy and who it belongs to; reuse of an old password is checked against stored hashes elsewhere. */
export function checkPassword(password: string, policy: PasswordPolicy, subject: PasswordSubject = {}): PasswordViolation[] {
  const violations: PasswordViolation[] = [];
  if (password.length < policy.minLength) violations.push('too_short');
  if (password.length > passwordMaxLength) violations.push('too_long');
  if (!/\p{L}/u.test(password)) violations.push('no_letter');
  if (!/\p{N}/u.test(password)) violations.push('no_digit');

  const lower = password.toLowerCase();
  const email = lowerTrim(subject.email);
  const local = email.split('@')[0] ?? '';
  if (email && (lower.includes(email) || matches(lower, local))) violations.push('contains_email');
  else if ([subject.firstName, subject.lastName, subject.middleName].some((name) => matches(lower, lowerTrim(name)))) violations.push('contains_name');
  if (commonPasswords.has(lower)) violations.push('common');
  return violations;
}

const violationMessages: Record<PasswordViolation, string> = {
  too_short: 'Password is shorter than the minimum length',
  too_long: 'Password is too long',
  no_letter: 'Password must contain a letter',
  no_digit: 'Password must contain a digit',
  contains_email: 'Password must not contain the email address',
  contains_name: 'Password must not contain the name',
  common: 'Password is too common',
  reused: 'Password was used recently',
};

export function describePasswordViolations(violations: PasswordViolation[], policy: PasswordPolicy): string {
  return violations.map((violation) => (violation === 'too_short' ? `${violationMessages[violation]} (${policy.minLength})` : violationMessages[violation])).join(', ');
}

/** A 400 in the published validation shape; `too_short:N` carries the minimum length so the client can say it in any language. */
export function passwordPolicyError(violations: PasswordViolation[], policy: PasswordPolicy) {
  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Password does not meet the password policy',
      details: violations.map((violation) => ({
        field: 'password',
        code: violation === 'too_short' ? `too_short:${policy.minLength}` : violation,
        message: violationMessages[violation],
      })),
    },
  });
}

export function assertPasswordPolicy(password: string, policy: PasswordPolicy, subject: PasswordSubject = {}) {
  const violations = checkPassword(password, policy, subject);
  if (violations.length > 0) throw passwordPolicyError(violations, policy);
}
