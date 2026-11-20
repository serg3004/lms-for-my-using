import 'reflect-metadata';

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  findPermissionAction,
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  validatePermissionGrants,
  type PermissionActionKey,
  type PermissionScope,
} from '@lms/shared/permission-catalog';

import type { PrismaService } from '../../database/prisma.service.js';
import { controllerEntries } from '../../testing/api-policy-controllers.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import type { CurrentUser } from './auth.schemas.js';
import { computeEffectivePermissions, type CustomRoleGrant } from './effective-permissions.js';
import type { EffectivePermissionsLookup } from './effective-permissions.loader.js';
import { permissionRouteMap } from './permission-route-map.js';
import { RolesGuard } from './roles.guard.js';
import { rolesMetadataKey, type UserRole } from './roles.js';

// PR 486 (CROLE-06): the acceptance guard of custom roles. Every role-protected route of the seven areas is driven through
// the real RolesGuard with a custom role held by a plain learner, so a new route, a new action or a changed policy
// that breaks "allowed with the right, refused without it" fails here and not in production.
// The HTTP and database side is in integration/custom-roles-acceptance.database.spec.ts.

const organizationId = '11111111-1111-1111-1111-111111111111';
const user: CurrentUser = {
  id: '22222222-2222-2222-2222-222222222222', organizationId, email: 'holder@example.test', firstName: 'Holder', lastName: 'Test',
  middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'Asia/Almaty', roles: ['learner'],
} as CurrentUser;

type Route = { id: string; controller: new (...args: never[]) => unknown; handler: () => unknown; roles: readonly UserRole[] };

const routes: Route[] = controllerEntries.flatMap(({ Controller }) =>
  Object.getOwnPropertyNames(Controller.prototype).flatMap((method) => {
    const handler = Object.getOwnPropertyDescriptor(Controller.prototype, method)?.value as unknown;
    const id = `${Controller.name}.${method}`;
    const roles = typeof handler === 'function' ? (Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined) : undefined;
    return roles?.length && permissionRouteMap[id] ? [{ id, controller: Controller as Route['controller'], handler: handler as () => unknown, roles }] : [];
  }),
);
// A plain learner is the holder of the custom role; routes a learner already opens say nothing about the custom grant.
const closedToLearner = routes.filter((route) => !route.roles.includes('learner'));

type Setup = { enabled?: boolean; grants?: readonly CustomRoleGrant[]; state?: 'active' | 'archived' };

async function decide(route: Route, setup: Setup): Promise<boolean> {
  const permissions = computeEffectivePermissions({
    builtInRoles: ['learner'],
    customRoles: setup.grants ? [{ state: setup.state ?? 'active', permissions: setup.grants }] : [],
    customRolesEnabled: setup.enabled ?? true,
  });
  const lookup = { forUser: async () => permissions } as unknown as EffectivePermissionsLookup;
  const prisma = { membership: { findMany: async () => [{ role: 'learner' }] } } as unknown as PrismaService;
  const guard = new RolesGuard(prisma, new Reflector(), lookup);
  const request = { currentUser: { ...user } } as unknown as AuthenticatedRequest;
  const context = {
    getHandler: () => route.handler,
    getClass: () => route.controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  try {
    return await guard.canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

const delegable = PERMISSION_ACTIONS.filter((item) => item.delegable);
const notDelegable = PERMISSION_ACTIONS.filter((item) => !item.delegable);
const grant = (action: PermissionActionKey, scope: PermissionScope): CustomRoleGrant => ({ action, scope });
const routesOf = (key: PermissionActionKey) => closedToLearner.filter((route) => permissionRouteMap[route.id]!.includes(key));

describe('custom roles acceptance (PR 486)', () => {
  it('has routes to drive: the seven areas are all present', () => {
    expect(closedToLearner.length).toBeGreaterThan(50);
    for (const group of PERMISSION_GROUPS) {
      expect(PERMISSION_ACTIONS.some((item) => item.group === group && item.delegable)).toBe(true);
    }
  });

  it.each(delegable.map((item) => [item.key] as const))('%s: opens its routes for every allowed scope and refuses all other routes', async (key) => {
    const item = findPermissionAction(key)!;
    const own = routesOf(key);
    for (const scope of item.scopes) {
      const setup: Setup = { grants: [grant(key, scope)] };
      for (const route of own) {
        expect({ key, scope, route: route.id, allowed: await decide(route, setup) }).toEqual({ key, scope, route: route.id, allowed: true });
      }
      for (const route of closedToLearner.filter((other) => !own.includes(other) && !permissionRouteMap[other.id]!.includes(key))) {
        // A route that needs a different action stays closed even though this role is active.
        expect({ key, scope, route: route.id, allowed: await decide(route, setup) }).toEqual({ key, scope, route: route.id, allowed: false });
      }
    }
  });

  it('keeps every route closed without a grant, while the switch is off, and after the role is archived', async () => {
    for (const item of delegable) {
      const grants = [grant(item.key, item.scopes[0]!)];
      for (const route of routesOf(item.key)) {
        expect({ route: route.id, setup: 'no role', allowed: await decide(route, {}) }).toEqual({ route: route.id, setup: 'no role', allowed: false });
        expect({ route: route.id, setup: 'switch off', allowed: await decide(route, { grants, enabled: false }) }).toEqual({ route: route.id, setup: 'switch off', allowed: false });
        expect({ route: route.id, setup: 'archived', allowed: await decide(route, { grants, state: 'archived' }) }).toEqual({ route: route.id, setup: 'archived', allowed: false });
      }
    }
  });

  it('never lets a not delegable action through: the editor refuses it and a stored grant adds nothing', async () => {
    expect(notDelegable.length).toBeGreaterThan(0);
    for (const item of notDelegable) {
      const problems = validatePermissionGrants([grant(item.key, item.scopes[0]!)]);
      expect({ key: item.key, codes: problems.map((problem) => problem.code) }).toEqual({ key: item.key, codes: expect.arrayContaining(['not_delegable']) });
      for (const route of routesOf(item.key)) {
        const permissionsOpen = await decide(route, { grants: [grant(item.key, item.scopes[0]!)] });
        expect({ key: item.key, route: route.id, allowed: permissionsOpen }).toEqual({ key: item.key, route: route.id, allowed: false });
      }
    }
  });

  it('refuses unknown actions, a scope the action does not allow and a missing dependency', () => {
    expect(validatePermissionGrants([{ action: 'no.such.action', scope: 'own' }]).map((problem) => problem.code)).toEqual(['unknown_action']);
    const needsMore = delegable.find((item) => item.requires.length > 0)!;
    const withoutDependency = validatePermissionGrants([grant(needsMore.key, needsMore.scopes[0]!)]);
    expect(withoutDependency.map((problem) => problem.code)).toContain('missing_dependency');
    const narrow = delegable.find((item) => item.scopes.length < 5 && item.requires.length === 0)!;
    const wrongScope = (['own', 'assigned', 'team', 'department', 'organization'] as const).find((scope) => !narrow.scopes.includes(scope));
    if (wrongScope) {
      expect(validatePermissionGrants([grant(narrow.key, wrongScope)]).map((problem) => problem.code)).toContain('scope_not_allowed');
    }
  });

  it('opens a route with two actions to the holder of either one', async () => {
    const twoActionRoutes = closedToLearner.filter((route) => permissionRouteMap[route.id]!.length > 1);
    expect(twoActionRoutes.length).toBeGreaterThan(0);
    for (const route of twoActionRoutes) {
      const actions = permissionRouteMap[route.id]!;
      for (const key of actions) {
        const scope = findPermissionAction(key)!.scopes[0]!;
        const dependencies = (findPermissionAction(key)!.requires ?? []).map((required) => grant(required, findPermissionAction(required)!.scopes[0]!));
        const opens = await decide(route, { grants: [grant(key, scope), ...dependencies] });
        if (findPermissionAction(key)!.delegable) expect({ route: route.id, key, opens }).toEqual({ route: route.id, key, opens: true });
      }
    }
  });
});

describe('forbidden vocabulary (PR 486)', () => {
  const word = ['i', 'Spring'].join('').toLowerCase();
  const roots = ['apps/api/src', 'apps/web/src', 'apps/e2e/tests', 'apps/e2e/fixtures', 'apps/e2e/visual-tests', 'packages/shared/src', 'docs'];
  const repoRoot = join(process.cwd(), '..', '..');

  function walk(directory: string, files: string[] = []): string[] {
    for (const name of readdirSync(directory)) {
      if (name === 'node_modules' || name === 'dist' || name.endsWith('-snapshots')) continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path, files);
      else if (/\.(ts|tsx|json|md|css|html|mjs|cjs)$/.test(name)) files.push(path);
    }
    return files;
  }

  it('does not appear in code, texts or documents (the reference sheet is called "эталон")', () => {
    const offenders = roots.flatMap((root) => walk(join(repoRoot, root))).filter((file) => readFileSync(file, 'utf8').toLowerCase().includes(word));
    expect(offenders).toEqual([]);
  });
});
