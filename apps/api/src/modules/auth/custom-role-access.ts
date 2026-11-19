import type { PermissionActionKey, PermissionScope } from '@lms/shared/permission-catalog';

import { builtInRolesFor } from './permission-catalog.adapter.js';
import type { EffectivePermissions } from './effective-permissions.js';
import { permissionRouteMap } from './permission-route-map.js';
import type { UserRole } from './roles.js';

/**
 * Catalog actions whose routes honour custom roles: checklists (PR 481), courses, lessons, materials, longreads, tests,
 * attempts and reports (PR 482). User management joins in PR 483; until then a custom grant of `user.*` opens nothing.
 */
export const customRoleEnforcedAction = (key: string): boolean => !key.startsWith('user.');

/** The catalog actions a route needs, limited to the connected ones. Empty: the route does not look at custom roles. */
export function enforcedActionsForRoute(controllerName: string, handlerName: string): readonly PermissionActionKey[] {
  return (permissionRouteMap[`${controllerName}.${handlerName}`] ?? []).filter(customRoleEnforcedAction);
}

type Domain = 'checklist' | 'course' | 'attempt' | 'report';

/** Which family of services sizes the request, and so how a granted scope has to be carried into it. */
function domainOf(key: string): Domain {
  if (key.startsWith('checklist.')) return 'checklist';
  if (key === 'assessment.attempt.read' || key === 'assessment.attempt.result.read') return 'attempt';
  if (key.startsWith('report.')) return 'report';
  return 'course';
}

export type CustomAccess = {
  /** A custom grant opens the route (alone or together with a built-in role). */
  opens: boolean;
  /** The roles the services will see for this request. */
  roles: UserRole[];
  orgWide: boolean;
  ownOnly: boolean;
};

const CHECKLIST_RANK: Record<UserRole, number> = { admin: 4, instructor: 3, mentor: 3, manager: 2, learner: 1 };
const rank = (role: UserRole) => CHECKLIST_RANK[role] ?? 1;

function scopesOf(permissions: EffectivePermissions, actions: readonly PermissionActionKey[], domain: Domain): Set<PermissionScope> {
  const result = new Set<PermissionScope>();
  for (const action of actions) {
    if (domainOf(action) !== domain) continue;
    for (const scope of permissions.get(action)?.scopes ?? []) result.add(scope);
  }
  return result;
}

/**
 * Decides one request. Services size a request by the user's roles (whole organization for an instructor of checklists,
 * the team for a manager, own courses for an instructor of courses, own rows for everyone else), so a custom grant is carried
 * into them as the built-in role of the same width for this request only. Never `admin`, never added narrower than what
 * the user already has. A grant of the whole organization removes the narrowing roles (course instructor, manager) from the
 * request instead; a grant of "own" narrows only when no built-in role opened the route, because a custom role never takes
 * anything away.
 */
export function resolveCustomAccess(input: {
  permissions: EffectivePermissions;
  actions: readonly PermissionActionKey[];
  userRoles: readonly UserRole[];
  viaBuiltIn: boolean;
}): CustomAccess {
  const { permissions, actions, userRoles, viaBuiltIn } = input;
  const opens = actions.some((action) => (permissions.get(action)?.scopes.size ?? 0) > 0);
  let roles = [...userRoles];
  let orgWide = false;
  let ownOnly = false;
  if (!opens) return { opens, roles, orgWide, ownOnly };

  const held = (action: PermissionActionKey) => userRoles.filter((role) => builtInRolesFor(action).includes(role));
  const add = (role: UserRole) => { if (!roles.includes(role)) roles.push(role); };

  // Checklists: the instructor and the mentor see the whole organization, the manager the team.
  const checklistScopes = scopesOf(permissions, actions, 'checklist');
  if (checklistScopes.size > 0) {
    const have = Math.max(0, ...actions.filter((action) => domainOf(action) === 'checklist').flatMap((action) => held(action).map(rank)));
    if (checklistScopes.has('organization')) {
      const wide = (['instructor', 'mentor'] as const).find((role) => actions.some((action) => builtInRolesFor(action).includes(role)));
      if (wide && have < rank(wide)) add(wide);
    }
    if ((checklistScopes.has('team') || checklistScopes.has('department')) && have < rank('manager')
      && actions.some((action) => builtInRolesFor(action).includes('manager'))) add('manager');
  }

  // Courses, lessons, materials, longreads and tests: an instructor sees own courses, everybody else the organization.
  const courseScopes = scopesOf(permissions, actions, 'course');
  if (courseScopes.has('organization')) {
    roles = roles.filter((role) => role !== 'instructor');
    orgWide = true;
  } else if (courseScopes.has('own') && !viaBuiltIn) {
    add('instructor');
  }

  // Attempts and their results: a manager sees the team, the rest of the roles are not narrowed, "own" is own attempts.
  const attemptScopes = scopesOf(permissions, actions, 'attempt');
  if (attemptScopes.has('organization')) {
    roles = roles.filter((role) => role !== 'instructor' && role !== 'manager');
    orgWide = true;
  } else if (attemptScopes.has('team') || attemptScopes.has('department')) {
    add('manager');
  } else if (attemptScopes.has('own') && !viaBuiltIn) {
    ownOnly = true;
  }

  // Reports: team and department are the manager's view, the organization is the administrator's view.
  const reportScopes = scopesOf(permissions, actions, 'report');
  if (reportScopes.has('organization')) {
    roles = roles.filter((role) => role !== 'manager');
    orgWide = true;
  } else if (reportScopes.has('team') || reportScopes.has('department')) {
    add('manager');
  }

  return { opens, roles, orgWide, ownOnly };
}
