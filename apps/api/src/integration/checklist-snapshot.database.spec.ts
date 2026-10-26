/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('checklist assignment snapshots — database', () => {
  let prisma: PrismaService;
  let organizationId: string;
  let learnerId: string;
  let assignerId: string;
  let checklistId: string;
  let itemId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist snapshot ${runId}`, slug: `checklist-snapshot-${runId}` },
    });
    organizationId = organization.id;

    const [learner, assigner] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          email: `learner-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Snapshot',
          lastName: 'Learner',
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          email: `assigner-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Snapshot',
          lastName: 'Assigner',
        },
      }),
    ]);
    learnerId = learner.id;
    assignerId = assigner.id;

    const checklist = await prisma.checklist.create({
      data: {
        organizationId,
        title: 'Original checklist',
        description: 'Original description',
        status: 'published',
        scoringMode: 'sum_points',
        passThreshold: 80,
        requiresReview: false,
        createdBy: assignerId,
      },
    });
    checklistId = checklist.id;

    const item = await prisma.checklistItem.create({
      data: {
        organizationId,
        checklistId,
        order: 0,
        text: 'Original item',
        points: 10,
        isRequired: true,
        photoRequired: false,
      },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklistItemGroup.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('keeps an assigned instance immutable while new assignments receive later template changes', async () => {
    const service = new ChecklistsService(prisma, {} as UploadService);
    const original = await service.assignChecklist(checklistId, organizationId, { userId: learnerId }, assignerId);

    const storedSnapshot = await prisma.checklistInstance.findUniqueOrThrow({
      where: { id: original.id },
      select: { templateSnapshot: true, snapshotVersion: true },
    });
    expect(storedSnapshot.snapshotVersion).toBe(1);
    expect(storedSnapshot.templateSnapshot).toMatchObject({
      version: 1,
      checklist: {
        title: 'Original checklist',
        passThreshold: 80,
        items: [expect.objectContaining({ id: itemId, text: 'Original item', points: 10, photoRequired: false })],
      },
    });

    await prisma.$transaction([
      prisma.checklist.update({
        where: { id: checklistId },
        data: {
          title: 'Changed checklist',
          description: 'Changed description',
          passThreshold: 95,
        },
      }),
      prisma.checklistItem.update({
        where: { id: itemId },
        data: { text: 'Changed item', points: 100, photoRequired: true },
      }),
      prisma.checklistItem.create({
        data: {
          organizationId,
          checklistId,
          order: 1,
          text: 'New item',
          points: 20,
          isRequired: true,
          photoRequired: false,
        },
      }),
    ]);

    const oldView = await service.getInstance(original.id, organizationId);
    expect(oldView.checklist).toMatchObject({
      title: 'Original checklist',
      description: 'Original description',
      passThreshold: 80,
      items: [expect.objectContaining({ id: itemId, text: 'Original item', points: 10, photoRequired: false })],
    });
    expect(oldView.checklist.items).toHaveLength(1);

    const completed = await service.submitItemResult(
      original.id,
      itemId,
      organizationId,
      learnerId,
      false,
      { checked: true },
    );
    expect(completed.status).toBe('completed');
    expect(completed.totalScore).toBe(10);
    expect(completed.maxScore).toBe(10);
    expect(completed.percentage).toBe(100);
    expect(completed.passed).toBe(true);

    const next = await service.assignChecklist(checklistId, organizationId, { userId: learnerId }, assignerId);
    const newView = await service.getInstance(next.id, organizationId);
    expect(newView.checklist).toMatchObject({
      title: 'Changed checklist',
      description: 'Changed description',
      passThreshold: 95,
    });
    expect(newView.checklist.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: itemId, text: 'Changed item', points: 100, photoRequired: true }),
      expect.objectContaining({ text: 'New item', points: 20 }),
    ]));
    expect(newView.checklist.items).toHaveLength(2);
    expect(next.maxScore).toBe(120);
  });

  it('keeps overview groups frozen after rename, reassignment and deletion, including bulk assignments (PR 347)', async () => {
    const service = new ChecklistsService(prisma, {} as UploadService);
    const group = await prisma.checklistItemGroup.create({ data: { organizationId, checklistId, title: 'Original group', order: 0 } });
    await prisma.checklistItem.update({ where: { id: itemId }, data: { groupId: group.id } });
    const original = await service.assignChecklist(checklistId, organizationId, { userId: learnerId }, assignerId);
    const before = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: original.id }, select: { templateSnapshot: true } });
    expect(before.templateSnapshot).toMatchObject({ checklist: { itemGroups: [{ id: group.id, title: 'Original group', order: 0 }], items: [{ groupId: group.id }] } });

    await prisma.checklistItemGroup.update({ where: { id: group.id }, data: { title: 'Renamed group', order: 5 } });
    const oldView = await service.getInstance(original.id, organizationId);
    expect(oldView.checklist.itemGroups).toMatchObject([{ id: group.id, title: 'Original group', order: 0 }]);
    expect(oldView.checklist.items[0]).toMatchObject({ id: itemId, groupId: group.id });
    await service.submitItemResult(original.id, itemId, organizationId, learnerId, false, { checked: true });
    const next = await service.assignChecklist(checklistId, organizationId, { userId: learnerId }, assignerId);
    expect((await service.getInstance(next.id, organizationId)).checklist.itemGroups).toMatchObject([{ id: group.id, title: 'Renamed group', order: 5 }]);
    await service.submitItemResult(next.id, itemId, organizationId, learnerId, false, { checked: true });

    await prisma.checklistItemGroup.delete({ where: { id: group.id } });
    expect((await service.getInstance(original.id, organizationId)).checklist.itemGroups).toMatchObject([{ id: group.id, title: 'Original group' }]);
    const replacement = await prisma.checklistItemGroup.create({ data: { organizationId, checklistId, title: 'Bulk group', order: 0 } });
    await prisma.checklistItem.update({ where: { id: itemId }, data: { groupId: replacement.id } });
    const bulk = await service.bulkAssignChecklist(checklistId, organizationId, { targets: [{ type: 'user', id: learnerId }] }, assignerId, ['admin']);
    expect(bulk.created).toBe(1);
    const bulkRow = await prisma.checklistInstance.findFirstOrThrow({ where: { organizationId, userId: learnerId, status: 'assigned' } });
    expect(bulkRow.templateSnapshot).toMatchObject({ checklist: { itemGroups: [{ id: replacement.id, title: 'Bulk group' }], items: [{ groupId: replacement.id }] } });
    await prisma.checklistItemGroup.update({ where: { id: replacement.id }, data: { title: 'Bulk renamed' } });
    expect((await service.getInstance(bulkRow.id, organizationId)).checklist.itemGroups).toMatchObject([{ title: 'Bulk group' }]);
    expect((await prisma.checklistInstance.findUniqueOrThrow({ where: { id: original.id } })).templateSnapshot).toEqual(before.templateSnapshot);
  });

});
