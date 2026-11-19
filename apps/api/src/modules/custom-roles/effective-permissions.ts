import {
  PERMISSION_ACTIONS,
  type PermissionActionKey,
  type PermissionScope,
} from '@lms/shared/permission-catalog';

import { builtInActionsForRole, builtInRolesFor, type UserRole } from '../auth/public.js';

export type CustomRoleGrant = { action: string; scope: PermissionScope };
export type CustomRoleInput = { state: 'active' | 'archived'; permissions: readonly CustomRoleGrant[] };

export type EffectivePermission = {
  /** True when a built-in role of the user already holds the action (its own scope rules apply as before). */
  builtIn: boolean;
  /** Scopes added by active custom roles. Union only: nothing here can remove a right. */
  scopes: ReadonlySet<PermissionScope>;
};

export type EffectivePermissions = ReadonlyMap<PermissionActionKey, EffectivePermission>;

const knownActions = new Set<string>(PERMISSION_ACTIONS.map((item) => item.key));

/**
 * PR 480: union of the built-in roles and the active custom roles of one user in one organization.
 * With `customRolesEnabled` false the custom roles are ignored, so the result equals the old `rolePolicies` decision.
 * An archived role, an unknown action or a custom grant of an action the catalog marks as not delegable adds nothing.
 */
export function computeEffectivePermissions(input: {
  builtInRoles: readonly UserRole[];
  customRoles: readonly CustomRoleInput[];
  customRolesEnabled: boolean;
}): EffectivePermissions {
  const result = new Map<PermissionActionKey, { builtIn: boolean; scopes: Set<PermissionScope> }>();
  const entry = (action: PermissionActionKey) => {
    let value = result.get(action);
    if (!value) {
      value = { builtIn: false, scopes: new Set() };
      result.set(action, value);
    }
    return value;
  };

  for (const role of input.builtInRoles) {
    for (const action of builtInActionsForRole(role)) entry(action).builtIn = true;
  }

  if (input.customRolesEnabled) {
    for (const role of input.customRoles) {
      if (role.state !== 'active') continue;
      for (const grant of role.permissions) {
        if (!knownActions.has(grant.action)) continue;
        const item = PERMISSION_ACTIONS.find((candidate) => candidate.key === grant.action);
        if (!item || !item.delegable || !item.scopes.includes(grant.scope)) continue;
        entry(item.key).scopes.add(grant.scope);
      }
    }
  }

  return result;
}

export function hasPermission(permissions: EffectivePermissions, action: PermissionActionKey): boolean {
  const value = permissions.get(action);
  return Boolean(value && (value.builtIn || value.scopes.size > 0));
}

export type ScopeFilter = {
  /** Every filter is bound to the organization, a scope can only narrow inside it. */
  organizationId: string;
  /** The built-in right or the organization scope: no narrowing beyond the organization. */
  unrestricted: boolean;
  /** Custom scopes that narrow the rows (own, assigned, team, department). Empty when unrestricted or denied. */
  scopes: readonly PermissionScope[];
  allowed: boolean;
};

export function scopeFilter(permissions: EffectivePermissions, action: PermissionActionKey, organizationId: string): ScopeFilter {
  const value = permissions.get(action);
  if (!value || (!value.builtIn && value.scopes.size === 0)) {
    return { organizationId, unrestricted: false, scopes: [], allowed: false };
  }
  const unrestricted = value.builtIn || value.scopes.has('organization');
  return {
    organizationId,
    unrestricted,
    scopes: unrestricted ? [] : [...value.scopes],
    allowed: true,
  };
}

/**
 * Diagnostic for the switch: the actions where the computed built-in decision differs from `rolePolicies`.
 * It must be empty for every role; a difference is logged and never grants anything.
 */
export function diffBuiltInDecisions(roles: readonly UserRole[]): PermissionActionKey[] {
  const computed = computeEffectivePermissions({ builtInRoles: roles, customRoles: [], customRolesEnabled: false });
  return PERMISSION_ACTIONS.map((item) => item.key).filter((key) => {
    const expected = builtInRolesFor(key).some((role) => roles.includes(role));
    return expected !== hasPermission(computed, key);
  });
}
