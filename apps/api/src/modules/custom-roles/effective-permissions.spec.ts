import { PERMISSION_ACTIONS } from '@lms/shared/permission-catalog';

import { USER_ROLES } from '@lms/shared/constants/roles';
import { builtInActionsForRole } from '../auth/permission-catalog.adapter.js';
import {
  computeEffectivePermissions,
  diffBuiltInDecisions,
  hasPermission,
  scopeFilter,
} from './effective-permissions.js';

const delegable = PERMISSION_ACTIONS.find((item) => item.delegable && item.scopes.includes('own') && item.scopes.includes('organization'));
if (!delegable) throw new Error('catalog has no delegable action with own and organization scopes');
const nonDelegable = PERMISSION_ACTIONS.find((item) => !item.delegable);

describe('effective permissions (PR 480)', () => {
  it('equals the old rolePolicies decision for every built-in role, alone and combined', () => {
    for (const role of USER_ROLES) expect(diffBuiltInDecisions([role])).toEqual([]);
    expect(diffBuiltInDecisions(['learner', 'instructor'])).toEqual([]);
    expect(diffBuiltInDecisions(['admin', 'manager', 'learner'])).toEqual([]);
  });

  it('adds a custom grant on top of the built-in role (union)', () => {
    const perms = computeEffectivePermissions({
      builtInRoles: ['learner'],
      customRoles: [{ state: 'active', permissions: [{ action: delegable.key, scope: 'own' }] }],
      customRolesEnabled: true,
    });
    expect(hasPermission(perms, delegable.key)).toBe(true);
    for (const action of builtInActionsForRole('learner')) expect(hasPermission(perms, action)).toBe(true);
  });

  it('combines several roles and keeps every scope', () => {
    const perms = computeEffectivePermissions({
      builtInRoles: ['learner'],
      customRoles: [
        { state: 'active', permissions: [{ action: delegable.key, scope: 'own' }] },
        { state: 'active', permissions: [{ action: delegable.key, scope: 'organization' }] },
      ],
      customRolesEnabled: true,
    });
    expect([...(perms.get(delegable.key)?.scopes ?? [])].sort()).toEqual(['organization', 'own']);
    const filter = scopeFilter(perms, delegable.key, 'org-1');
    expect(filter).toMatchObject({ organizationId: 'org-1', unrestricted: true, allowed: true });
  });

  it('narrows to the granted scopes and always keeps the organization in the filter', () => {
    const perms = computeEffectivePermissions({
      builtInRoles: [],
      customRoles: [{ state: 'active', permissions: [{ action: delegable.key, scope: 'own' }] }],
      customRolesEnabled: true,
    });
    expect(scopeFilter(perms, delegable.key, 'org-1')).toEqual({
      organizationId: 'org-1',
      unrestricted: false,
      scopes: ['own'],
      allowed: true,
    });
  });

  it('an archived role gives nothing', () => {
    const perms = computeEffectivePermissions({
      builtInRoles: [],
      customRoles: [{ state: 'archived', permissions: [{ action: delegable.key, scope: 'own' }] }],
      customRolesEnabled: true,
    });
    expect(hasPermission(perms, delegable.key)).toBe(false);
    expect(scopeFilter(perms, delegable.key, 'org-1').allowed).toBe(false);
  });

  it('with the switch off custom roles are ignored', () => {
    const perms = computeEffectivePermissions({
      builtInRoles: [],
      customRoles: [{ state: 'active', permissions: [{ action: delegable.key, scope: 'own' }] }],
      customRolesEnabled: false,
    });
    expect(hasPermission(perms, delegable.key)).toBe(false);
  });

  it('ignores unknown actions, scopes the action does not allow and non-delegable actions', () => {
    const grants = [
      { action: 'no.such.action', scope: 'own' as const },
      ...(nonDelegable ? [{ action: nonDelegable.key, scope: 'organization' as const }] : []),
    ];
    const perms = computeEffectivePermissions({
      builtInRoles: [],
      customRoles: [{ state: 'active', permissions: grants }],
      customRolesEnabled: true,
    });
    expect(perms.size).toBe(0);
  });
});
