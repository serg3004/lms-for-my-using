import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard.js';
import { accessMetadataKey, rolesMetadataKey, type EndpointAccess, type UserRole } from './roles.js';

import { controllerEntries, type ControllerClass, type EndpointHandler } from './api-policy.controllers.js';

const allRoles: UserRole[] = ['admin', 'manager', 'instructor', 'mentor', 'learner'];

const protectedEndpoints = controllerEntries.flatMap(({ Controller }) =>
  Object.getOwnPropertyNames(Controller.prototype).flatMap((methodName) => {
    const handler = Object.getOwnPropertyDescriptor(Controller.prototype, methodName)?.value as unknown;
    const roles = typeof handler === 'function' ? (Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined) : undefined;

    return roles?.length ? [{ Controller, methodName, handler: handler as EndpointHandler, roles }] : [];
  }),
);

function roleContext(Controller: ControllerClass, handler: EndpointHandler, role: UserRole): ExecutionContext {
  const request = {
    currentUser: {
      id: 'user-id',
      organizationId: 'organization-id',
      email: 'user@example.com',
      roles: [role],
    },
  };

  return {
    getClass: () => Controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function rolesGuardFor(role: UserRole): RolesGuard {
  const prisma = {
    membership: {
      findMany: async () => [{ role }],
    },
  };

  return new RolesGuard(prisma as never, new Reflector());
}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return controllerFiles(path);
    }

    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('API access policy audit', () => {
  it('keeps the audit inventory synchronized with every production controller', () => {
    const modulesDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = controllerFiles(modulesDirectory)
      .map((path) => relative(modulesDirectory, path))
      .sort();

    expect(files).toEqual(controllerEntries.map(({ file }) => file).sort());
  });

  it.each(controllerEntries)('$Controller.name gives every endpoint exactly one explicit access policy', ({ Controller }) => {
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, Controller) as unknown[] | undefined;

    for (const methodName of Object.getOwnPropertyNames(Controller.prototype)) {
      const handler = Object.getOwnPropertyDescriptor(Controller.prototype, methodName)?.value as unknown;

      if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
        continue;
      }

      const roles = Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined;
      const access = Reflect.getMetadata(accessMetadataKey, handler) as EndpointAccess | undefined;
      const classifications = [roles?.length ? 'roles' : undefined, access].filter(Boolean);

      expect({ controller: Controller.name, method: methodName, classifications }).toEqual({
        controller: Controller.name,
        method: methodName,
        classifications: [expect.any(String)],
      });

      if (roles?.length) {
        const methodGuards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;
        expect([...(classGuards ?? []), ...(methodGuards ?? [])]).toContain(RolesGuard);
      }
    }
  });

  it.each(
    protectedEndpoints.flatMap(({ Controller, methodName, handler, roles }) =>
      allRoles.map((role) => ({ Controller, methodName, handler, roles, role })),
    ),
  )('$Controller.name.$methodName enforces the centralized policy for $role', async ({ Controller, handler, roles, role }) => {
    const authorization = rolesGuardFor(role).canActivate(roleContext(Controller, handler, role));

    if (roles.includes(role)) {
      await expect(authorization).resolves.toBe(true);
    } else {
      await expect(authorization).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
