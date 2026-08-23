import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
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
  it('filters manager pending reviews to users in the managed team', async () => {
    const prisma = {
      user: { findMany: jest.fn(async () => [{ id: 'user-in-scope' }]) },
    } as unknown as PrismaService;
    const service = new ChecklistReviewAccessService(prisma, new ManagerTeamScope());
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
        groupMemberships: expect.any(Object),
      }),
    }));
  });

  it('does not team-scope admin reviewers', async () => {
    const prisma = { user: { findMany: jest.fn() } } as unknown as PrismaService;
    const service = new ChecklistReviewAccessService(prisma, new ManagerTeamScope());
    const instances = [{ userId: 'user-anywhere' }];

    await expect(service.filterPending(currentUser(['admin']), instances)).resolves.toBe(instances);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('denies a manager direct evidence/review access outside their team', async () => {
    const prisma = {
      checklistInstance: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new ChecklistReviewAccessService(prisma, new ManagerTeamScope());

    await expect(service.assertReviewerCanAccess(currentUser(['manager']), 'instance-foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'instance-foreign',
        organizationId,
        user: expect.any(Object),
      }),
    }));
  });
});
