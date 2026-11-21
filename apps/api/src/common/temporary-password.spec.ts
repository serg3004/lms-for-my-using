import { checkPassword, defaultPasswordPolicy } from './password-policy.js';
import { generateTemporaryPassword, temporaryPasswordLifetimeMs } from './temporary-password.js';

describe('temporary password (PR 489)', () => {
  it('always satisfies the policy, is not repeated and is at least 12 characters', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const password = generateTemporaryPassword(defaultPasswordPolicy, { email: 'ivan@example.com', firstName: 'Иван', lastName: 'Петров' });
      expect(password.length).toBeGreaterThanOrEqual(12);
      expect(checkPassword(password, defaultPasswordPolicy)).toEqual([]);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });

  it('follows a longer minimum of the organization', () => {
    expect(generateTemporaryPassword({ minLength: 20, historyCount: 3 })).toHaveLength(20);
  });

  it('lives seven days', () => {
    expect(temporaryPasswordLifetimeMs).toBe(7 * 24 * 3600 * 1000);
  });
});
