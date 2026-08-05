import { describe, expect, it } from 'vitest';
import {
  computeAssignmentStats,
  findCourseTitle,
  findGroupLabel,
  findUserLabel,
  getUserLabel,
  type Assignment,
  type Course,
  type Group,
  type User,
} from './model.js';

const user: User = { id: 'u1', email: 'a@b.com', firstName: 'Иван', lastName: 'Петров', middleName: null, status: 'active' };
const course: Course = { id: 'c1', organizationId: 'org1', title: 'Course One', status: 'published' };
const group: Group = { id: 'g1', organizationId: 'org1', name: 'Group One', status: 'active' };

describe('getUserLabel', () => {
  it('joins last and first name', () => {
    expect(getUserLabel(user)).toBe('Петров Иван');
  });

  it('falls back to email when no name', () => {
    expect(getUserLabel({ ...user, firstName: '', lastName: '' })).toBe('a@b.com');
  });
});

describe('findCourseTitle', () => {
  it('returns the course title when found', () => {
    expect(findCourseTitle([course], 'c1')).toBe('Course One');
  });

  it('falls back to the id when not found', () => {
    expect(findCourseTitle([course], 'missing')).toBe('missing');
  });
});

describe('findUserLabel', () => {
  it('returns fallback when userId is null', () => {
    expect(findUserLabel([user], null, 'fallback')).toBe('fallback');
  });

  it('returns the user label when found', () => {
    expect(findUserLabel([user], 'u1', 'fallback')).toBe('Петров Иван');
  });

  it('returns the id when the user is not found', () => {
    expect(findUserLabel([user], 'missing', 'fallback')).toBe('missing');
  });
});

describe('findGroupLabel', () => {
  it('returns fallback when groupId is null', () => {
    expect(findGroupLabel([group], null, 'fallback')).toBe('fallback');
  });

  it('returns the group name when found', () => {
    expect(findGroupLabel([group], 'g1', 'fallback')).toBe('Group One');
  });

  it('returns the id when the group is not found', () => {
    expect(findGroupLabel([group], 'missing', 'fallback')).toBe('missing');
  });
});

describe('computeAssignmentStats', () => {
  const now = new Date('2026-08-05T00:00:00Z').getTime();
  const day = 24 * 60 * 60 * 1000;

  const assignments: Assignment[] = [
    { id: '1', courseId: 'c1', userId: 'u1', groupId: null, status: 'assigned', dueAt: new Date(now + 2 * day).toISOString() },
    { id: '2', courseId: 'c1', userId: 'u1', groupId: null, status: 'assigned', dueAt: new Date(now - 2 * day).toISOString() },
    { id: '3', courseId: 'c1', userId: 'u1', groupId: null, status: 'assigned', dueAt: null },
    { id: '4', courseId: 'c1', userId: 'u1', groupId: null, status: 'completed', dueAt: null },
    { id: '5', courseId: 'c1', userId: 'u1', groupId: null, status: 'cancelled', dueAt: null },
  ];

  it('counts active, due this week, overdue, and completed assignments', () => {
    expect(computeAssignmentStats(assignments, now)).toEqual({
      active: 3,
      dueThisWeek: 1,
      overdue: 1,
      completed: 1,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(computeAssignmentStats([], now)).toEqual({ active: 0, dueThisWeek: 0, overdue: 0, completed: 0 });
  });
});
