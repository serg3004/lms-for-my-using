import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { rolePolicies, rolesMetadataKey, type UserRole } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { OrgStructureAdminController } from './org-structure-admin.controller.js';
import type { OrgStructureAdminService } from './org-structure-admin.service.js';

const orgId = '11111111-1111-1111-1111-111111111111';

function contextFor(role: UserRole): ExecutionContext {
  const request = { currentUser: { id: 'user-id', organizationId: orgId, email: 'user@example.com', roles: [role] } };
  return {
    getClass: () => OrgStructureAdminController,
    getHandler: () => OrgStructureAdminController.prototype.counts,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function rolesGuardFor(role: UserRole) {
  const prisma = { membership: { findMany: async () => [{ role }] } };
  return new RolesGuard(prisma as never, new Reflector());
}

describe('OrgStructureAdminController counts', () => {
  it('uses the departmentsRead policy, like the history read', () => {
    expect(Reflect.getMetadata(rolesMetadataKey, OrgStructureAdminController.prototype.counts)).toEqual([...rolePolicies.departmentsRead]);
  });

  it('rejects a role without departmentsRead with 403', async () => {
    const outsider = (['manager', 'instructor', 'learner'] as UserRole[]).find((role) => !rolePolicies.departmentsRead.includes(role))!;
    await expect(rolesGuardFor(outsider).canActivate(contextFor(outsider))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an admin', async () => {
    await expect(rolesGuardFor('admin').canActivate(contextFor('admin'))).resolves.toBe(true);
  });

  it('counts only the caller organization', async () => {
    const counts = { departments: 1, positions: 2, positionCourses: 3, groups: 4, historyEvents: 5 };
    const service = { counts: jest.fn<() => Promise<typeof counts>>().mockResolvedValue(counts) } as unknown as OrgStructureAdminService;
    const controller = new OrgStructureAdminController(service);

    await expect(controller.counts({ currentUser: { organizationId: orgId } } as unknown as AuthenticatedRequest)).resolves.toEqual(counts);
    expect(service.counts).toHaveBeenCalledWith(orgId);
  });
});
