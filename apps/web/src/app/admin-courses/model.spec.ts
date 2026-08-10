import { describe, expect, it } from 'vitest';

import { formatUserName, usersAvailableToAdd } from './model.js';

describe('admin courses model', () => {
  it('formats a user name, falling back to email when the last name is missing', () => {
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: 'Ivanov', email: 'alex@example.com' })).toBe('Alex Ivanov');
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: null, email: 'alex@example.com' })).toBe('Alex');
    expect(formatUserName({ id: 'u1', firstName: '', lastName: null, email: 'alex@example.com' })).toBe('alex@example.com');
  });

  it('returns only instructor-role users who are not already assigned', () => {
    const instructor = {
      id: 'u1',
      firstName: 'Alex',
      lastName: 'Ivanov',
      email: 'alex@example.com',
      memberships: [{ role: 'instructor' }],
    };
    const learner = {
      id: 'u2',
      firstName: 'Maria',
      lastName: 'Petrova',
      email: 'maria@example.com',
      memberships: [{ role: 'learner' }],
    };
    const multiRoleInstructor = {
      id: 'u3',
      firstName: 'Sam',
      lastName: 'Lee',
      email: 'sam@example.com',
      memberships: [{ role: 'admin' }, { role: 'instructor' }],
    };
    const userWithoutMemberships = {
      id: 'u4',
      firstName: 'No',
      lastName: 'Role',
      email: 'norole@example.com',
    };
    const users = [instructor, learner, multiRoleInstructor, userWithoutMemberships];

    expect(usersAvailableToAdd(users, [])).toEqual([instructor, multiRoleInstructor]);
    expect(usersAvailableToAdd(users, ['u1'])).toEqual([multiRoleInstructor]);
    expect(usersAvailableToAdd(users, ['u1', 'u3'])).toEqual([]);
  });
});
