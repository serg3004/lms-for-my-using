import type { PermissionActionKey } from '@lms/shared/permission-catalog';

import { builtInRolesFor } from './permission-catalog.adapter.js';
import { hasPermission, type EffectivePermissions } from './effective-permissions.js';
import { permissionRouteMap } from './permission-route-map.js';
import type { UserRole } from './roles.js';

/**
 * PR 481: the catalog actions whose routes already honour custom roles. Checklists, folders, sessions, reviews and
 * checklist reports. Courses, longreads and tests join in PR 482 and users in PR 483; until then a custom grant of such an
 * action opens nothing, so a half-connected area cannot leak.
 */
export const customRoleEnforcedAction = (key: string): boolean => key.startsWith('checklist.');

/** The catalog actions a route needs, limited to the connected ones. Empty: the route does not look at custom roles. */
export function enforcedActionsForRoute(controllerName: string, handlerName: string): readonly PermissionActionKey[] {
  return (permissionRouteMap[`${controllerName}.${handlerName}`] ?? []).filter(customRoleEnforcedAction);
}

/**
 * Services decide how wide a request may reach by the user's roles (whole organization for an instructor, the team for
 * a manager, own rows for everyone else). A custom grant is carried into them as the built-in role that holds the same
 * action at the same scope, for this request only. Never `admin`, never `learner`: what only the administrator may do
 * stays with the administrator, and nothing is removed.
 */
export function syntheticRolesFor(permissions: EffectivePermissions, actions: readonly PermissionActionKey[]): UserRole[] {
  const result = new Set<UserRole>();
  for (const action of actions) {
    const grant = permissions.get(action);
    if (!grant || grant.scopes.size === 0) continue;
    const holders = builtInRolesFor(action);
    if (grant.scopes.has('organization')) {
      // One organization-wide role is enough: the instructor first, then the mentor.
      const wide = (['instructor', 'mentor'] as const).find((role) => holders.includes(role));
      if (wide) result.add(wide);
    }
    if (grant.scopes.has('team') || grant.scopes.has('department')) {
      if (holders.includes('manager')) result.add('manager');
    }
  }
  return [...result];
}

/** True when a custom role grants at least one of the route's connected actions. */
export function customRoleOpensRoute(permissions: EffectivePermissions, actions: readonly PermissionActionKey[]): boolean {
  return actions.some((action) => {
    const grant = permissions.get(action);
    return Boolean(grant && grant.scopes.size > 0) && hasPermission(permissions, action);
  });
}
