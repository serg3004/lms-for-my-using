import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/public.js';
import { CHECKLIST_EXPIRED_MESSAGE } from './checklist-deadlines.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const instanceId = '22222222-2222-4222-8222-222222222222';
const learnerId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-08-23T12:00:00.000Z');

function serviceFor(status: string, dueAt: Date | null) {
  const updateMany = jest.fn(async () => ({ count: 1 }));
  const prisma = {
    checklistInstance: {
      findFirst: jest.fn(async () => ({ id: instanceId, userId: learnerId, status, dueAt })),
      updateMany,
    },
  } as unknown as PrismaService;
  return {
    service: new ChecklistsService(prisma, {} as UploadService),
    updateMany,
  };
}

describe('ChecklistsService deadline write guard', () => {
  it('allows an active assignment before its due time', async () => {
    const { service, updateMany } = serviceFor('assigned', new Date('2026-08-23T12:00:00.001Z'));

    await expect(service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now)).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('atomically expires and rejects an assignment exactly at dueAt', async () => {
    const { service, updateMany } = serviceFor('in_progress', now);

    await expect(service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now))
      .rejects.toMatchObject<Partial<BadRequestException>>({ message: CHECKLIST_EXPIRED_MESSAGE });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: instanceId,
        organizationId,
        deletedAt: null,
        status: { in: ['assigned', 'in_progress'] },
        dueAt: { lte: now },
      },
      data: { status: 'expired' },
    });
  });

  it('rejects an assignment after dueAt and treats expired as terminal', async () => {
    const overdue = serviceFor('assigned', new Date('2026-08-23T11:59:59.999Z'));
    await expect(overdue.service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now))
      .rejects.toMatchObject({ message: CHECKLIST_EXPIRED_MESSAGE });

    const expired = serviceFor('expired', new Date('2026-08-23T11:00:00.000Z'));
    await expect(expired.service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now))
      .rejects.toMatchObject({ message: CHECKLIST_EXPIRED_MESSAGE });
    expect(expired.updateMany).not.toHaveBeenCalled();
  });

  it('keeps assignments without dueAt writable and submitted/completed terminal for editing', async () => {
    const open = serviceFor('in_progress', null);
    await expect(open.service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now)).resolves.toBeUndefined();

    for (const status of ['submitted', 'completed']) {
      const terminal = serviceFor(status, new Date('2026-08-23T11:00:00.000Z'));
      await expect(terminal.service.assertInstanceWritable(instanceId, organizationId, learnerId, false, now))
        .rejects.toMatchObject({ message: 'This checklist assignment is no longer editable' });
      expect(terminal.updateMany).not.toHaveBeenCalled();
    }
  });
});
