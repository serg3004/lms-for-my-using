import { BadRequestException } from '@nestjs/common';

import { assertPasswordPolicy, checkPassword, defaultPasswordPolicy, describePasswordViolations, passwordPolicyError } from './password-policy.js';

const subject = { email: 'ivan.petrov@example.com', firstName: 'Иван', lastName: 'Петров' };

describe('password policy (PR 488)', () => {
  it('accepts a password with letters and digits that is long enough', () => {
    expect(checkPassword('Tulip7Garden', defaultPasswordPolicy, subject)).toEqual([]);
  });

  it('follows the organization minimum length', () => {
    expect(checkPassword('ab12', { minLength: 5, historyCount: 3 })).toEqual(['too_short']);
    expect(checkPassword('ab123', { minLength: 5, historyCount: 3 })).toEqual([]);
    expect(checkPassword('ab12345678', { minLength: 12, historyCount: 3 })).toEqual(['too_short']);
  });

  it('requires a letter and a digit', () => {
    expect(checkPassword('onlyletterss', defaultPasswordPolicy)).toContain('no_digit');
    expect(checkPassword('1234567890', defaultPasswordPolicy)).toContain('no_letter');
  });

  it('rejects the email, its local part and the name', () => {
    expect(checkPassword('ivan.petrov@example.com1', defaultPasswordPolicy, subject)).toContain('contains_email');
    expect(checkPassword('ivan.petrov2026', defaultPasswordPolicy, subject)).toContain('contains_email');
    expect(checkPassword('Петров12345', defaultPasswordPolicy, subject)).toContain('contains_name');
  });

  it('rejects common passwords', () => {
    expect(checkPassword('Password123', defaultPasswordPolicy)).toContain('common');
  });

  it('builds a validation error that carries the minimum length', () => {
    const error = passwordPolicyError(['too_short'], defaultPasswordPolicy);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(error.getResponse())).toContain('too_short:10');
    expect(describePasswordViolations(['too_short', 'common'], defaultPasswordPolicy)).toContain('(10)');
  });

  it('assertPasswordPolicy throws only on violations', () => {
    expect(() => assertPasswordPolicy('Tulip7Garden', defaultPasswordPolicy, subject)).not.toThrow();
    expect(() => assertPasswordPolicy('short1', defaultPasswordPolicy, subject)).toThrow(BadRequestException);
  });
});
