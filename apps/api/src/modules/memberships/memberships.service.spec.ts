import { ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { createMembershipSchema } from './memberships.schemas';
import { MembershipsService } from './memberships.service';

describe('Memberships validation', () => {
  it('accepts valid membership input', () => {
    const input = createMembershipSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'learner',
      assignedBy: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'learner',
      assignedBy: '33333333-3333-3333-3333-333333333333',
    });
  });

  it('rejects invalid membership role', () => {
    expect(() =>
      createMembershipSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'owner',
      }),
    ).toThrow();
  });
});

describe('MembershipsService.deleteMembership', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';
  const actorId = '33333333-3333-3333-3333-333333333333';
  const otherId = '22222222-2222-2222-2222-222222222222';

  function setup(membership: { role: string; userId: string } | null, administrators = 2) {
    const prisma = {
      membership: {
        findFirst: jest.fn(async () => (membership ? { id: 'm1', organizationId, ...membership } : null)),
        count: jest.fn(async () => administrators),
        delete: jest.fn(async () => ({})),
      },
    };
    const auditLog = { record: jest.fn(async () => undefined) };
    const service = new MembershipsService(prisma as never, auditLog as never);
    return { service, prisma, auditLog };
  }

  it('removes a role of another user and writes the audit log', async () => {
    const { service, prisma, auditLog } = setup({ role: 'manager', userId: otherId });
    await service.deleteMembership('m1', organizationId, actorId);
    expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'membership.revoked', actorId, targetId: otherId, metadata: { role: 'manager' } }));
  });

  it('answers 404 for a role of another organization or an unknown id', async () => {
    const { service, prisma } = setup(null);
    await expect(service.deleteMembership('m1', organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1', organizationId } }));
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });

  it('keeps the last administrator and the own administrator role', async () => {
    const last = setup({ role: 'admin', userId: otherId }, 1);
    await expect(last.service.deleteMembership('m1', organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    const own = setup({ role: 'admin', userId: actorId }, 3);
    await expect(own.service.deleteMembership('m1', organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    expect(last.prisma.membership.delete).not.toHaveBeenCalled();
    expect(own.prisma.membership.delete).not.toHaveBeenCalled();
  });

  it('removes an administrator role of another user while another administrator remains', async () => {
    const { service, prisma } = setup({ role: 'admin', userId: otherId }, 2);
    await service.deleteMembership('m1', organizationId, actorId);
    expect(prisma.membership.delete).toHaveBeenCalled();
  });
});
