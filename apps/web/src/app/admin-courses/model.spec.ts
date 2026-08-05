import { describe, expect, it } from 'vitest';

import { formatUserName, usersAvailableToAdd } from './model.js';

describe('admin courses model', () => {
  it('formats a user name, falling back to email when the last name is missing', () => {
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: 'Ivanov', email: 'alex@example.com' })).toBe('Alex Ivanov');
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: null, email: 'alex@example.com' })).toBe('Alex');
    expect(formatUserName({ id: 'u1', firstName: '', lastName: null, email: 'alex@example.com' })).toBe('alex@example.com');
  });

  it('filters out users already present in the excluded id list', () => {
    const users = [
      { id: 'u1', firstName: 'Alex', lastName: 'Ivanov', email: 'alex@example.com' },
      { id: 'u2', firstName: 'Maria', lastName: 'Petrova', email: 'maria@example.com' },
    ];
    expect(usersAvailableToAdd(users, ['u1'])).toEqual([users[1]]);
    expect(usersAvailableToAdd(users, [])).toEqual(users);
    expect(usersAvailableToAdd(users, ['u1', 'u2'])).toEqual([]);
  });
});
