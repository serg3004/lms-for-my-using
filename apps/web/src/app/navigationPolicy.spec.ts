import { describe, expect, it } from 'vitest';

import { canAccessPath, protectedPathPrefixes } from './navigationPolicy.js';

describe('navigationPolicy', () => {
  it('keeps every role workspace behind authentication', () => {
    expect(protectedPathPrefixes).toEqual(['/learn', '/admin', '/manager', '/instructor', '/mentor']);
  });

  it('allows admins and managers into the admin workspace', () => {
    expect(canAccessPath('/admin/users', { roles: ['admin'] })).toBe(true);
    expect(canAccessPath('/admin/courses', { roles: ['manager'] })).toBe(true);
    expect(canAccessPath('/admin', { roles: ['instructor'] })).toBe(false);
  });

  it('limits manager and instructor workspaces to their matching roles', () => {
    expect(canAccessPath('/manager/team', { roles: ['manager'] })).toBe(true);
    expect(canAccessPath('/managerial', { roles: ['learner'] })).toBe(true);
    expect(canAccessPath('/manager/team', { roles: ['admin'] })).toBe(false);
    expect(canAccessPath('/instructor/courses', { roles: ['instructor'] })).toBe(true);
    expect(canAccessPath('/instructor/courses', { roles: ['manager'] })).toBe(false);
  });

  it('limits the mentor workspace to the mentor role', () => {
    expect(canAccessPath('/mentor', { roles: ['mentor'] })).toBe(true);
    expect(canAccessPath('/mentor', { roles: ['instructor'] })).toBe(false);
    expect(canAccessPath('/mentoring', { roles: [] })).toBe(true);
  });

  it('allows authenticated users into learner and public routes', () => {
    expect(canAccessPath('/learn/courses', { roles: ['learner'] })).toBe(true);
    expect(canAccessPath('/login', { roles: [] })).toBe(true);
  });

  it.each([
    ['/admin', ['admin'], true],
    ['/admin/users', ['manager'], true],
    ['/administer', ['learner'], true],
    ['/manager', ['manager'], true],
    ['/manager/team', ['learner'], false],
    ['/instructor', ['instructor'], true],
    ['/instructor/courses', [], false],
    ['/learn', [], true],
    ['/', [], true],
  ] as const)('evaluates %s for roles %j', (path, roles, expected) => {
    expect(canAccessPath(path, { roles: [...roles] })).toBe(expected);
  });
});
