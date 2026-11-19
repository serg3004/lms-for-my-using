import 'reflect-metadata';

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_ACTIONS, type PermissionScope } from '@lms/shared/permission-catalog';

import { controllerEntries } from '../../testing/api-policy-controllers.js';
import { isOrgWideGrant, isOwnOnlyGrant } from './access-scope.js';
import { customRoleEnforcedAction, resolveCustomAccess } from './custom-role-access.js';
import { computeEffectivePermissions } from './effective-permissions.js';
import { EffectivePermissionsLookup } from './effective-permissions.loader.js';
import { permissionRouteMap } from './permission-route-map.js';
import { RolesGuard } from './roles.guard.js';
import { rolesMetadataKey, type UserRole } from './roles.js';

type Route = { id: string; controller: string; handler: string; target: object; method: (...args: never[]) => unknown };

const routes: Route[] = controllerEntries.flatMap(({ Controller }) =>
  Object.getOwnPropertyNames(Controller.prototype).flatMap((name) => {
    const method = Object.getOwnPropertyDescriptor(Controller.prototype, name)?.value as ((...args: never[]) => unknown) | undefined;
    return typeof method === 'function' && Reflect.getMetadata(rolesMetadataKey, method)
      ? [{ id: `${Controller.name}.${name}`, controller: Controller.name, handler: name, target: Controller, method }]
      : [];
  }),
);

function contextFor(route: Route, user: { id: string; organizationId: string; roles: UserRole[] }): { context: ExecutionContext; request: { currentUser: typeof user } } {
  const request = { currentUser: user };
  const controllerClass = controllerEntries.find((entry) => entry.Controller.name === route.controller)!.Controller;
  const context = {
    getHandler: () => route.method,
    getClass: () => controllerClass,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function guardWith(builtInRoles: UserRole[], customRoles: Parameters<typeof computeEffectivePermissions>[0]['customRoles'], enabled = true) {
  const prisma = { membership: { findMany: async () => builtInRoles.map((role) => ({ role })) } } as never;
  const lookup = { forUser: async () => computeEffectivePermissions({ builtInRoles, customRoles, customRolesEnabled: enabled }) } as unknown as EffectivePermissionsLookup;
  return new RolesGuard(prisma, new Reflector(), lookup);
}

const user = (roles: UserRole[]) => ({ id: 'u1', organizationId: 'o1', roles });
async function allowed(guard: RolesGuard, route: Route, roles: UserRole[]) {
  const { context } = contextFor(route, user(roles));
  try {
    return await guard.canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

const enforcedActions = PERMISSION_ACTIONS.filter((item) => item.delegable && customRoleEnforcedAction(item.key));

describe('custom roles on checklist routes (PR 481)', () => {
  it('opens exactly the routes of the granted action, for every connected action and scope', async () => {
    for (const item of enforcedActions) {
      for (const scope of item.scopes) {
        const guard = guardWith(['learner'], [{ state: 'active', permissions: [{ action: item.key, scope }] }]);
        for (const route of routes) {
          const builtIn = (Reflect.getMetadata(rolesMetadataKey, route.method) as UserRole[]).includes('learner');
          const mapped = (permissionRouteMap[route.id] ?? []).includes(item.key as never);
          expect({ route: route.id, action: item.key, scope, open: await allowed(guard, route, ['learner']) }).toEqual({
            route: route.id, action: item.key, scope, open: builtIn || mapped,
          });
        }
      }
    }
  });

  it('never opens a route of an area that is not connected yet (user management)', async () => {
    const guard = guardWith(['learner'], [{
      state: 'active',
      permissions: PERMISSION_ACTIONS.filter((item) => item.delegable).map((item) => ({ action: item.key, scope: item.scopes[item.scopes.length - 1] as PermissionScope })),
    }]);
    for (const route of routes) {
      const builtIn = (Reflect.getMetadata(rolesMetadataKey, route.method) as UserRole[]).includes('learner');
      const connected = (permissionRouteMap[route.id] ?? []).some(customRoleEnforcedAction);
      if (builtIn || connected) continue;
      expect({ route: route.id, open: await allowed(guard, route, ['learner']) }).toEqual({ route: route.id, open: false });
    }
    expect(PERMISSION_ACTIONS.filter((item) => !customRoleEnforcedAction(item.key)).map((item) => item.key)).toEqual(['user.read', 'user.create']);
  });

  it('gives nothing with the switch off, with an archived role, and without the lookup', async () => {
    const grant = [{ state: 'active' as const, permissions: [{ action: 'checklist.author', scope: 'organization' as const }] }];
    const route = routes.find((candidate) => candidate.id === 'ChecklistsController.createChecklist')!;
    expect(await allowed(guardWith(['learner'], grant, true), route, ['learner'])).toBe(true);
    expect(await allowed(guardWith(['learner'], grant, false), route, ['learner'])).toBe(false);
    expect(await allowed(guardWith(['learner'], [{ ...grant[0]!, state: 'archived' }], true), route, ['learner'])).toBe(false);
    const prisma = { membership: { findMany: async () => [{ role: 'learner' }] } } as never;
    expect(await allowed(new RolesGuard(prisma, new Reflector()), route, ['learner'])).toBe(false);
  });

  it('keeps built-in roles as they were whatever custom roles exist', async () => {
    const guard = guardWith(['instructor'], []);
    const plain = new RolesGuard({ membership: { findMany: async () => [{ role: 'instructor' }] } } as never, new Reflector());
    for (const route of routes) {
      expect({ route: route.id, open: await allowed(guard, route, ['instructor']) }).toEqual({ route: route.id, open: await allowed(plain, route, ['instructor']) });
    }
  });

  it('carries a checklist grant into the request as the built-in role of that scope, never admin', async () => {
    const analytics = routes.find((candidate) => candidate.id === 'ChecklistsController.getManagerAnalytics')!;
    for (const [scope, expected] of [['team', 'manager'], ['organization', 'instructor']] as const) {
      const guard = guardWith(['learner'], [{ state: 'active', permissions: [{ action: 'checklist.analytics.read', scope }] }]);
      const { context, request } = contextFor(analytics, user(['learner']));
      await guard.canActivate(context);
      expect(request.currentUser.roles).toEqual(['learner', expected]);
    }
  });

  it('marks the request when a custom grant widens it to the organization or narrows it to own rows', async () => {
    const attempts = routes.find((candidate) => candidate.id === 'AssessmentAttemptsController.listAttempts')!;
    const wide = guardWith(['learner'], [{ state: 'active', permissions: [{ action: 'assessment.attempt.read', scope: 'organization' }] }]);
    const wideCall = contextFor(attempts, user(['learner']));
    await wide.canActivate(wideCall.context);
    expect(isOrgWideGrant(wideCall.request.currentUser)).toBe(true);

    const own = guardWith(['learner'], [{ state: 'active', permissions: [{ action: 'assessment.attempt.read', scope: 'own' }] }]);
    const ownCall = contextFor(attempts, user(['learner']));
    await own.canActivate(ownCall.context);
    expect(isOwnOnlyGrant(ownCall.request.currentUser)).toBe(true);
    expect(isOrgWideGrant(ownCall.request.currentUser)).toBe(false);
  });
});

describe('resolveCustomAccess (PR 481-482)', () => {
  const grant = (action: string, scope: PermissionScope) => computeEffectivePermissions({
    builtInRoles: [], customRoles: [{ state: 'active', permissions: [{ action, scope }] }], customRolesEnabled: true,
  });
  const resolve = (action: string, scope: PermissionScope, userRoles: UserRole[], viaBuiltIn: boolean) =>
    resolveCustomAccess({ permissions: grant(action, scope), actions: [action as never], userRoles, viaBuiltIn });

  it('courses: own narrows only a custom-only user to the instructor view, organization removes the course narrowing', () => {
    expect(resolve('course.edit', 'own', ['learner'], false).roles).toEqual(['learner', 'instructor']);
    expect(resolve('course.edit', 'own', ['instructor'], true).roles).toEqual(['instructor']);
    expect(resolve('course.read', 'own', ['learner'], true).roles).toEqual(['learner']);
    const wide = resolve('course.edit', 'organization', ['learner', 'instructor'], true);
    expect(wide).toMatchObject({ roles: ['learner'], orgWide: true });
    expect(resolve('longread.edit', 'organization', ['learner'], false)).toMatchObject({ roles: ['learner'], orgWide: true, opens: true });
  });

  it('attempts: team is the manager view, organization removes team and course narrowing, own filters own rows', () => {
    expect(resolve('assessment.attempt.read', 'team', ['learner'], false).roles).toEqual(['learner', 'manager']);
    expect(resolve('assessment.attempt.read', 'department', ['learner'], false).roles).toEqual(['learner', 'manager']);
    expect(resolve('assessment.attempt.read', 'organization', ['manager', 'instructor'], true)).toMatchObject({ roles: [], orgWide: true });
    expect(resolve('assessment.attempt.read', 'own', ['learner'], false)).toMatchObject({ ownOnly: true, orgWide: false });
    expect(resolve('assessment.attempt.read', 'own', ['manager'], true).ownOnly).toBe(false);
  });

  it('reports: team is the manager view, organization is the unnarrowed view', () => {
    expect(resolve('report.course.read', 'team', ['learner'], false).roles).toEqual(['learner', 'manager']);
    expect(resolve('report.course.read', 'organization', ['manager'], true)).toMatchObject({ roles: [], orgWide: true });
  });

  it('checklists: adds a role only when it is wider than what the user already has', () => {
    expect(resolve('checklist.analytics.read', 'team', ['instructor'], true).roles).toEqual(['instructor']);
    expect(resolve('checklist.analytics.read', 'team', ['manager'], true).roles).toEqual(['manager']);
    expect(resolve('checklist.analytics.read', 'organization', ['manager'], true).roles).toEqual(['manager', 'instructor']);
    expect(resolve('checklist.analytics.read', 'organization', ['instructor'], true).roles).toEqual(['instructor']);
  });

  it('never adds admin and never takes anything but the narrowing roles away, whatever the grant', () => {
    for (const item of PERMISSION_ACTIONS.filter((candidate) => candidate.delegable && customRoleEnforcedAction(candidate.key))) {
      for (const scope of item.scopes) {
        for (const roles of [['learner'], ['manager'], ['instructor'], ['mentor'], ['admin'], ['learner', 'manager', 'instructor']] as UserRole[][]) {
          for (const viaBuiltIn of [true, false]) {
            const result = resolve(item.key, scope, roles, viaBuiltIn);
            expect(result.roles.includes('admin')).toBe(roles.includes('admin'));
            for (const role of roles) {
              if (role === 'instructor' || role === 'manager') continue;
              expect(result.roles).toContain(role);
            }
          }
        }
      }
    }
  });
});
