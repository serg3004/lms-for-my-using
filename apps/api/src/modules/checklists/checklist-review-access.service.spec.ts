import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';
import { OrganizationAccessScopeService } from '../organization-access-scope/public.js';
import { ChecklistReviewAccessService } from './checklist-review-access.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const managerId = '22222222-2222-2222-2222-222222222222';

function currentUser(roles: CurrentUser['roles']): CurrentUser {
  return {
    id: managerId,
    organizationId,
    email: 'manager@example.test',
    firstName: 'Manager',
    lastName: 'User',
    middleName: null,
    position: null,
    shift: null,
    phone: null,
    status: 'active',
    locale: 'en',
    timezone: 'UTC',
    roles,
  };
}

describe('ChecklistReviewAccessService', () => {
  function accessScope(userWhere: object = { OR: [{ groupMemberships: { some: {} } }, { id: { in: ['department-user', 'direct-report'] } }] }) {
    return {
      user: jest.fn(async () => userWhere),
      userOwnedResource: jest.fn(async () => ({ user: userWhere })),
    } as unknown as OrganizationAccessScopeService;
  }

  it('filters manager pending reviews to users in the managed team', async () => {
    const prisma = {
      user: { findMany: jest.fn(async () => [{ id: 'user-in-scope' }]) },
    } as unknown as PrismaService;
    const scope = accessScope();
    const service = new ChecklistReviewAccessService(prisma, scope);
    const manager = currentUser(['manager']);

    const result = await service.filterPending(manager, [
      { userId: 'user-in-scope', marker: 'allowed' },
      { userId: 'user-out-of-scope', marker: 'hidden' },
    ]);

    expect(result).toEqual([{ userId: 'user-in-scope', marker: 'allowed' }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        id: { in: ['user-in-scope', 'user-out-of-scope'] },
        OR: expect.arrayContaining([
          expect.objectContaining({ groupMemberships: expect.any(Object) }),
          { id: { in: ['department-user', 'direct-report'] } },
        ]),
      }),
    }));
    expect(scope.user).toHaveBeenCalledWith(manager);
  });

  it('does not team-scope admin reviewers', async () => {
    const prisma = { user: { findMany: jest.fn() } } as unknown as PrismaService;
    const scope = accessScope();
    const service = new ChecklistReviewAccessService(prisma, scope);
    const instances = [{ userId: 'user-anywhere' }];

    await expect(service.filterPending(currentUser(['admin']), instances)).resolves.toBe(instances);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(scope.user).not.toHaveBeenCalled();
  });

  it('denies a manager direct evidence/review access outside their team', async () => {
    const prisma = {
      checklistInstance: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const scope = accessScope({ id: { in: ['user-in-effective-scope'] } });
    const service = new ChecklistReviewAccessService(prisma, scope);

    await expect(service.assertReviewerCanAccess(currentUser(['manager']), 'instance-foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'instance-foreign',
        organizationId,
        user: { id: { in: ['user-in-effective-scope'] } },
      }),
    }));
    expect(scope.userOwnedResource).toHaveBeenCalledWith(currentUser(['manager']));
  });

  it('builds list and analytics scope from the effective organization scope', async () => {
    const prisma = {} as PrismaService;
    const userWhere = { OR: [{ id: { in: ['group-user', 'department-user', 'direct-report'] } }] };
    const scope = accessScope(userWhere);
    const service = new ChecklistReviewAccessService(prisma, scope);
    const manager = currentUser(['manager']);

    await expect(service.reviewQueueScope(manager)).resolves.toEqual({ user: userWhere });
    expect(scope.userOwnedResource).toHaveBeenCalledWith(manager);
  });

  it('leaves admin list and analytics scope tenant-wide', async () => {
    const scope = accessScope();
    const service = new ChecklistReviewAccessService({} as PrismaService, scope);

    await expect(service.reviewQueueScope(currentUser(['admin']))).resolves.toEqual({});
    expect(scope.userOwnedResource).not.toHaveBeenCalled();
  });

  it('defines tenant-wide session scope for admins', async () => {
    const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());

    await expect(service.sessionScope(currentUser(['admin']))).resolves.toEqual({});
  });

  it('defines manager session scope through the effective organization union', async () => {
    const userWhere = { OR: [{ id: { in: ['group-user', 'department-user', 'direct-report'] } }] };
    const scope = accessScope(userWhere);
    const service = new ChecklistReviewAccessService({} as PrismaService, scope);
    const manager = currentUser(['manager']);

    await expect(service.sessionScope(manager)).resolves.toEqual({ instance: { user: userWhere } });
    expect(scope.user).toHaveBeenCalledWith(manager);
  });

  it('restricts instructors to sessions where they are the assigned observer', async () => {
    const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());

    await expect(service.sessionScope(currentUser(['instructor']))).resolves.toEqual({ observerId: managerId });
  });

  it('restricts employees to sessions attached to their own checklist instance', async () => {
    const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());

    await expect(service.sessionScope(currentUser(['learner']))).resolves.toEqual({
      instance: { userId: managerId },
    });
  });

  it('combines manager scope with assigned-observer scope for a dual-role user', async () => {
    const userWhere = { id: { in: ['managed-user'] } };
    const scope = accessScope(userWhere);
    const service = new ChecklistReviewAccessService({} as PrismaService, scope);

    await expect(service.sessionScope(currentUser(['manager', 'instructor']))).resolves.toEqual({ OR: [
      { instance: { user: userWhere } },
      { observerId: managerId },
    ] });
  });

  describe('observerActionScope (PR 302 review fix)', () => {
    it('is unrestricted for admin', () => {
      const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());
      expect(service.observerActionScope(currentUser(['admin']))).toEqual({});
    });

    it('is always observerId-only for a pure instructor', () => {
      const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());
      expect(service.observerActionScope(currentUser(['instructor']))).toEqual({ observerId: managerId });
    });

    it('never widens to the manager-team union for a dual manager+instructor user, unlike sessionScope()', () => {
      const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());
      // sessionScope() (read) legitimately returns an OR union for this same user (see the
      // "combines manager scope..." test above) -- observerActionScope() (write) must not, since
      // "mark my own session unavailable" must never mean "any session my team can see."
      expect(service.observerActionScope(currentUser(['manager', 'instructor']))).toEqual({ observerId: managerId });
    });
  });

  describe('participantLearnerScope (PR 292)', () => {
    it('is tenant-wide for admin', async () => {
      const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());

      await expect(service.participantLearnerScope(currentUser(['admin']))).resolves.toEqual({});
    });

    it("is the manager's effective team scope for a manager", async () => {
      const userWhere = { OR: [{ id: { in: ['group-user', 'department-user', 'direct-report'] } }] };
      const scope = accessScope(userWhere);
      const service = new ChecklistReviewAccessService({} as PrismaService, scope);
      const manager = currentUser(['manager']);

      await expect(service.participantLearnerScope(manager)).resolves.toEqual(userWhere);
      expect(scope.user).toHaveBeenCalledWith(manager);
    });

    it('is tenant-wide for a non-manager, non-admin role (e.g. instructor picking a learner)', async () => {
      const service = new ChecklistReviewAccessService({} as PrismaService, accessScope());

      await expect(service.participantLearnerScope(currentUser(['instructor']))).resolves.toEqual({});
    });
  });
});
