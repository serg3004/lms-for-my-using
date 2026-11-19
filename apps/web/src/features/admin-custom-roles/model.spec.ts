import { describe, expect, it } from 'vitest';

import { dependentActions, formsEqual, requiredActions, setScope, toggleAction, validateRoleForm } from './model.js';

describe('role editor rules (PR 485)', () => {
  it('ticking an action also ticks what it needs, starting at the narrowest scope', () => {
    const { grants, changed } = toggleAction([], 'user.create', true);
    expect(grants.map((grant) => grant.action)).toEqual(expect.arrayContaining(['user.create', 'user.read']));
    expect(changed).toEqual(['user.read']);
    expect(grants.every((grant) => grant.scope === 'department')).toBe(true);
  });

  it('unticking an action also unticks what needs it', () => {
    const start = toggleAction([], 'user.create', true).grants;
    const { grants, changed } = toggleAction(start, 'user.read', false);
    expect(grants).toEqual([]);
    expect(changed).toEqual(['user.create']);
    expect(dependentActions('user.read')).toContain('user.create');
    expect(requiredActions('user.create')).toContain('user.read');
  });

  it('changes the scope of one grant only', () => {
    const start = toggleAction([], 'user.create', true).grants;
    const next = setScope(start, 'user.create', 'organization');
    expect(next.find((grant) => grant.action === 'user.create')?.scope).toBe('organization');
    expect(next.find((grant) => grant.action === 'user.read')?.scope).toBe('department');
  });

  it('validates the name and the set the same way the server does', () => {
    expect(validateRoleForm({ name: ' ', description: '', grants: [] })).toEqual({ name: 'required', grants: 'empty' });
    expect(validateRoleForm({ name: 'x'.repeat(81), description: '', grants: toggleAction([], 'user.read', true).grants }).name).toBe('tooLong');
    expect(validateRoleForm({ name: 'ok', description: '', grants: [{ action: 'user.create', scope: 'department' }] })).toEqual({ grants: 'invalid' });
    expect(validateRoleForm({ name: 'ok', description: '', grants: toggleAction([], 'user.read', true).grants })).toEqual({});
  });

  it('compares forms ignoring the order of grants and the spaces around text', () => {
    const grants = toggleAction([], 'user.create', true).grants;
    expect(formsEqual({ name: 'A ', description: '', grants }, { name: 'A', description: ' ', grants: [...grants].reverse() })).toBe(true);
    expect(formsEqual({ name: 'A', description: '', grants }, { name: 'B', description: '', grants })).toBe(false);
  });
});
