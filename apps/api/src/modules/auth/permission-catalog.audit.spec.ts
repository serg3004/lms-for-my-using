import {
  delegablePermissionActions,
  findPermissionAction,
  NON_DELEGABLE_CAPABILITIES,
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABEL_LOCALES,
  PERMISSION_SCOPES,
  type PermissionActionKey,
} from '@lms/shared/permission-catalog';
import { USER_ROLES } from '@lms/shared/constants/roles';

import { controllerEntries } from '../../testing/api-policy-controllers.js';
import { actionPolicies, builtInActionsForRole, builtInRolesFor } from './permission-catalog.adapter.js';
import { permissionRouteMap } from './permission-route-map.js';
import { rolePolicies, rolesMetadataKey, type UserRole } from './roles.js';

/** Controllers of the seven areas of the first version. Everything else is listed below with the reason. */
const catalogFiles = [
  'assessment-attempts/', 'assessment-questions/', 'assessments/', 'checklists/', 'course-materials/', 'courses/',
  'lessons/', 'longreads/', 'manager/', 'reports/', 'users/',
];

/** Role-protected controllers outside the seven areas: kept on system roles, not given to custom roles in this version. */
const outsideCatalog: Record<string, string> = {
  'assignments/': 'assignments are a separate area; not part of the first version',
  'audit-log/': 'security: the audit journal stays with the administrator',
  'certificates/': 'certificates are a separate area; not part of the first version',
  'department-managers/': 'organization structure stays with the administrator',
  'department-memberships/': 'organization structure stays with the administrator',
  'departments/': 'organization structure stays with the administrator',
  'groups/': 'organization structure stays with the administrator',
  'learner-dashboard/': 'own data of the signed-in user',
  'memberships/': 'granting roles (including admin) is never delegated',
  'notifications/': 'own notifications of the signed-in user',
  'org-external-references/': 'organization structure stays with the administrator',
  'org-structure-admin/': 'organization structure stays with the administrator',
  'organizations/': 'organizations, theme and feature switches stay with the administrator',
  'position-courses/': 'organization structure stays with the administrator',
  'positions/': 'organization structure stays with the administrator',
  'progress/': 'own progress of the learner',
  'reporting-lines/': 'organization structure stays with the administrator',
};

const inCatalog = (file: string) => catalogFiles.some((prefix) => file.startsWith(prefix));

type Route = { id: string; file: string; roles: readonly UserRole[] };

const roleRoutes: Route[] = controllerEntries.flatMap(({ file, Controller }) =>
  Object.getOwnPropertyNames(Controller.prototype).flatMap((method) => {
    const handler = Object.getOwnPropertyDescriptor(Controller.prototype, method)?.value as unknown;
    const roles = typeof handler === 'function' ? (Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined) : undefined;
    return roles?.length ? [{ id: `${Controller.name}.${method}`, file, roles }] : [];
  }),
);
const catalogRoutes = roleRoutes.filter((route) => inCatalog(route.file));

describe('permission catalog (PR 479)', () => {
  it('maps every role-protected route of the seven areas to catalog actions, and nothing else', () => {
    expect(catalogRoutes.map((route) => route.id).sort()).toEqual(Object.keys(permissionRouteMap).sort());
  });

  it('accounts for every role-protected controller: in the catalog or listed with the reason it stays out', () => {
    const outside = roleRoutes.filter((route) => !inCatalog(route.file));
    for (const route of outside) {
      expect({ route: route.id, listed: Object.keys(outsideCatalog).some((prefix) => route.file.startsWith(prefix)) }).toEqual({ route: route.id, listed: true });
    }
    for (const prefix of Object.keys(outsideCatalog)) {
      expect(outside.some((route) => route.file.startsWith(prefix))).toBe(true);
    }
  });

  it('refers only to catalog actions and leaves no action without a route', () => {
    const used = new Set(Object.values(permissionRouteMap).flat());
    for (const key of used) expect(findPermissionAction(key)).toBeDefined();
    const unused = PERMISSION_ACTIONS.map((item) => item.key).filter((key) => !used.has(key));
    expect(unused).toEqual([]);
  });

  it('reproduces the built-in roles exactly: every route is open to the same roles before and after, for all five roles', () => {
    expect(USER_ROLES).toHaveLength(5);
    for (const route of catalogRoutes) {
      const actions = permissionRouteMap[route.id]!;
      for (const role of USER_ROLES) {
        const viaCatalog = actions.some((key) => builtInActionsForRole(role).includes(key));
        expect({ route: route.id, role, allowed: viaCatalog }).toEqual({ route: route.id, role, allowed: route.roles.includes(role) });
      }
    }
  });

  it('names a policy for every action and the policy exists', () => {
    expect(Object.keys(actionPolicies).sort()).toEqual(PERMISSION_ACTIONS.map((item) => item.key).sort());
    for (const key of Object.keys(actionPolicies) as PermissionActionKey[]) {
      expect(rolePolicies[actionPolicies[key]]).toBeDefined();
      expect(builtInRolesFor(key).length).toBeGreaterThan(0);
    }
  });

  it('is well formed: unique keys, known groups and scopes, labels in four languages, an acyclic dependency graph', () => {
    const keys = PERMISSION_ACTIONS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of PERMISSION_ACTIONS) {
      expect(PERMISSION_GROUPS).toContain(item.group);
      expect(item.scopes.length).toBeGreaterThan(0);
      for (const scope of item.scopes) expect(PERMISSION_SCOPES).toContain(scope);
      for (const locale of PERMISSION_LABEL_LOCALES) expect(item.labels[locale].trim()).not.toBe('');
      for (const required of item.requires) expect(findPermissionAction(required)).toBeDefined();
    }
    const visit = (key: string, path: string[]) => {
      expect(path).not.toContain(key);
      for (const required of findPermissionAction(key)!.requires) visit(required, [...path, key]);
    };
    for (const key of keys) visit(key, []);
  });

  it('covers every group of the first version', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(PERMISSION_ACTIONS.some((item) => item.group === group)).toBe(true);
    }
  });

  it('keeps the non-delegable list out of the catalog and out of what an administrator can grant', () => {
    for (const capability of NON_DELEGABLE_CAPABILITIES) {
      expect(findPermissionAction(capability)).toBeUndefined();
    }
    const delegable = new Set(delegablePermissionActions().map((item) => item.key));
    // The decision about who may observe is an access setting: it stays with the administrator.
    expect(delegable.has('checklist.access.settings')).toBe(false);
    // No delegable action may be the only way into a route that hands out roles or reaches another organization.
    for (const [route, actions] of Object.entries(permissionRouteMap)) {
      if (/^(Memberships|Organizations)Controller\./.test(route)) {
        expect(actions.every((key) => !delegable.has(key))).toBe(true);
      }
    }
  });
});
