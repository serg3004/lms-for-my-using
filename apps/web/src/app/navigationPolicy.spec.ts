import { describe, expect, it } from 'vitest';

import { canAccessPath, protectedPathPrefixes } from './navigationPolicy.js';

describe('navigationPolicy', () => {
  it('keeps every role workspace behind authentication', () => {
    expect(protectedPathPrefixes).toEqual(['/learn', '/admin', '/manager', '/instructor']);
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

  it('allows authenticated users into learner and public routes', () => {
    expect(canAccessPath('/learn/courses', { roles: ['learner'] })).toBe(true);
    expect(canAccessPath('/login', { roles: [] })).toBe(true);
  });
});
