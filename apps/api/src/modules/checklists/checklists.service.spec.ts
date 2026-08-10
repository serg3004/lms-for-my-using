import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const learnerId = '22222222-2222-2222-2222-222222222222';
const instructorId = '33333333-3333-3333-3333-333333333333';

type FakeChecklist = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: string;
  scoringMode: string;
  passThreshold: number;
  scaleLevels: unknown;
  requiresReview: boolean;
  createdBy: string | null;
  deletedAt: Date | null;
};

/**
 * A minimal in-memory stand-in for PrismaService covering only the checklist tables, so the
 * scoring/status-transition logic in ChecklistsService can be exercised end to end (assign ->
 * submit -> recompute -> review) without a real database.
 */
function createFakePrisma() {
  const checklists: FakeChecklist[] = [];
  const items: Array<{ id: string; organizationId: string; checklistId: string; order: number; text: string; points: number; isRequired: boolean; photoRequired: boolean; deletedAt: Date | null }> = [];
  const instances: Array<{ id: string; organizationId: string; checklistId: string; userId: string; assignedBy: string | null; status: string; totalScore: number; maxScore: number; percentage: number; passed: boolean; dueAt: Date | null; submittedAt: Date | null; completedAt: Date | null; deletedAt: Date | null }> = [];
  const results: Array<{ id: string; organizationId: string; instanceId: string; itemId: string; checked: boolean; scaleLevel: number | null; points: number; photoUrl: string | null; comment: string | null; reviewStatus: string; reviewComment: string | null; reviewedBy: string | null; reviewedAt: Date | null }> = [];
  const users = [
    { id: learnerId, organizationId, deletedAt: null },
    { id: instructorId, organizationId, deletedAt: null },
  ];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const prisma = {
    checklist: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        checklists.find((c) => c.id === where['id'] && c.organizationId === where['organizationId'] && c.deletedAt === (where['deletedAt'] ?? null)) ?? null,
      findFirstOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
        const found = checklists.find((c) => c.id === where['id']);
        if (!found) throw new Error('not found');
        return found;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => checklists.filter((c) => c.organizationId === where['organizationId'] && c.deletedAt === null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const checklist: FakeChecklist = {
          id: nextId('checklist'),
          organizationId: data['organizationId'] as string,
          title: data['title'] as string,
          description: (data['description'] as string) ?? null,
          status: 'draft',
          scoringMode: (data['scoringMode'] as string) ?? 'sum_points',
          passThreshold: (data['passThreshold'] as number) ?? 80,
          scaleLevels: data['scaleLevels'] ?? null,
          requiresReview: (data['requiresReview'] as boolean) ?? false,
          createdBy: (data['createdBy'] as string) ?? null,
          deletedAt: null,
        };
        checklists.push(checklist);
        return checklist;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const checklist = checklists.find((c) => c.id === where['id']);
        if (!checklist) throw new Error('not found');
        Object.assign(checklist, data);
        return checklist;
      },
    },
    checklistItem: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        items.find((i) => i.id === where['id'] && i.deletedAt === null) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        items.filter((i) => i.checklistId === where['checklistId'] && i.deletedAt === null).sort((a, b) => a.order - b.order),
      count: async ({ where }: { where: Record<string, unknown> }) => items.filter((i) => i.checklistId === where['checklistId'] && i.deletedAt === null).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: nextId('item'),
          organizationId: data['organizationId'] as string,
          checklistId: data['checklistId'] as string,
          order: data['order'] as number,
          text: data['text'] as string,
          points: (data['points'] as number) ?? 0,
          isRequired: (data['isRequired'] as boolean) ?? true,
          photoRequired: (data['photoRequired'] as boolean) ?? false,
          deletedAt: null,
        };
        items.push(item);
        return item;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const item = items.find((i) => i.id === where['id']);
        if (!item) throw new Error('not found');
        Object.assign(item, data);
        return item;
      },
    },
    checklistInstance: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const statusFilter = where['status'] as { in: string[] } | string | undefined;
        return (
          instances.find((instance) => {
            if (where['id'] !== undefined && instance.id !== where['id']) return false;
            if (where['checklistId'] !== undefined && instance.checklistId !== where['checklistId']) return false;
            if (where['userId'] !== undefined && instance.userId !== where['userId']) return false;
            if (where['organizationId'] !== undefined && instance.organizationId !== where['organizationId']) return false;
            if (statusFilter && typeof statusFilter === 'object' && !statusFilter.in.includes(instance.status)) return false;
            if (typeof statusFilter === 'string' && instance.status !== statusFilter) return false;
            return true;
          }) ?? null
        );
      },
      findFirstOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
        const found = instances.find((i) => i.id === where['id']);
        if (!found) throw new Error('not found');
        return found;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        instances.filter((i) => (where['userId'] === undefined || i.userId === where['userId']) && (where['status'] === undefined || i.status === where['status'])),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const instance = {
          id: nextId('instance'),
          organizationId: data['organizationId'] as string,
          checklistId: data['checklistId'] as string,
          userId: data['userId'] as string,
          assignedBy: (data['assignedBy'] as string) ?? null,
          status: 'assigned',
          totalScore: 0,
          maxScore: (data['maxScore'] as number) ?? 0,
          percentage: 0,
          passed: false,
          dueAt: (data['dueAt'] as Date) ?? null,
          submittedAt: null,
          completedAt: null,
          deletedAt: null,
        };
        instances.push(instance);
        return instance;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const instance = instances.find((i) => i.id === where['id']);
        if (!instance) throw new Error('not found');
        Object.assign(instance, data);
        return instance;
      },
    },
    checklistItemResult: {
      findUnique: async ({ where }: { where: { instanceId_itemId: { instanceId: string; itemId: string } } }) =>
        results.find((r) => r.instanceId === where.instanceId_itemId.instanceId && r.itemId === where.instanceId_itemId.itemId) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => results.filter((r) => r.instanceId === where['instanceId']),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { instanceId_itemId: { instanceId: string; itemId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = results.find(
          (r) => r.instanceId === where.instanceId_itemId.instanceId && r.itemId === where.instanceId_itemId.itemId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          id: nextId('result'),
          organizationId: create['organizationId'] as string,
          instanceId: create['instanceId'] as string,
          itemId: create['itemId'] as string,
          checked: (create['checked'] as boolean) ?? false,
          scaleLevel: (create['scaleLevel'] as number) ?? null,
          points: create['points'] as number,
          photoUrl: (create['photoUrl'] as string) ?? null,
          comment: (create['comment'] as string) ?? null,
          reviewStatus: 'pending',
          reviewComment: null,
          reviewedBy: null,
          reviewedAt: null,
        };
        results.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { instanceId_itemId: { instanceId: string; itemId: string } };
        data: Record<string, unknown>;
      }) => {
        const result = results.find(
          (r) => r.instanceId === where.instanceId_itemId.instanceId && r.itemId === where.instanceId_itemId.itemId,
        );
        if (!result) throw new Error('not found');
        Object.assign(result, data);
        return result;
      },
    },
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        users.find((u) => u.id === where['id'] && u.organizationId === where['organizationId']) ?? null,
    },
  };

  return prisma as unknown as PrismaService;
}

describe('ChecklistsService — scoring modes', () => {
  it('computes sum_points scoring: only checked items count their points, unchecked score 0', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'Приёмка стажёра', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Получил СИЗ', points: 10, isRequired: true, photoRequired: false });
    await service.createItem(checklist.id, organizationId, { text: 'Прошёл инструктаж', points: 20, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });

    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    expect(instance.maxScore).toBe(30);

    const items = await service.listItems(checklist.id, organizationId);
    const updated1 = await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { checked: true });
    expect(updated1.totalScore).toBe(10);
    expect(updated1.status).toBe('in_progress');

    const final = await service.submitItemResult(instance.id, items[1].id, organizationId, learnerId, false, { checked: false });
    expect(final.totalScore).toBe(10);
    expect(final.maxScore).toBe(30);
    expect(final.percentage).toBe(33);
    expect(final.status).toBe('completed');
    expect(final.passed).toBe(false);
  });

  it('computes all_required scoring: every item contributes exactly 1 point regardless of its configured points', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'Обязательный обход', scoringMode: 'all_required', passThreshold: 100, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт 1', points: 50, isRequired: true, photoRequired: false });
    await service.createItem(checklist.id, organizationId, { text: 'Пункт 2', points: 50, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });

    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    expect(instance.maxScore).toBe(2);

    const items = await service.listItems(checklist.id, organizationId);
    await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { checked: true });
    const final = await service.submitItemResult(instance.id, items[1].id, organizationId, learnerId, false, { checked: true });

    expect(final.totalScore).toBe(2);
    expect(final.percentage).toBe(100);
    expect(final.passed).toBe(true);
  });

  it('computes scale scoring from the checklist-level configurable levels (e.g. 1..5 with custom labels)', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      {
        organizationId,
        title: 'Аттестация кассира',
        scoringMode: 'scale',
        passThreshold: 60,
        requiresReview: false,
        scaleLevels: [
          { level: 1, label: 'Очень плохо', points: 0 },
          { level: 2, label: 'Плохо', points: 25 },
          { level: 3, label: 'Хорошо', points: 50 },
          { level: 4, label: 'Очень хорошо', points: 75 },
          { level: 5, label: 'Отлично', points: 100 },
        ],
      },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Работа с кассой', points: 0, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });

    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    expect(instance.maxScore).toBe(100);

    const items = await service.listItems(checklist.id, organizationId);
    const final = await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { scaleLevel: 4 });

    expect(final.totalScore).toBe(75);
    expect(final.percentage).toBe(75);
    expect(final.passed).toBe(true);
  });

  it('rejects a scale level that is not part of the checklist configuration', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      {
        organizationId,
        title: 'Тест',
        scoringMode: 'scale',
        passThreshold: 60,
        requiresReview: false,
        scaleLevels: [
          { level: 1, label: 'Плохо', points: 0 },
          { level: 2, label: 'Хорошо', points: 10 },
        ],
      },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт', points: 0, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);

    await expect(
      service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { scaleLevel: 99 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChecklistsService — manual review flow', () => {
  it('holds the instance at submitted until an instructor reviews every item, then finalizes the result', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'С проверкой наставника', scoringMode: 'sum_points', passThreshold: 50, requiresReview: true },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт 1', points: 10, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);

    const submitted = await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { checked: true });
    expect(submitted.status).toBe('submitted');
    expect(submitted.passed).toBe(false); // not finalized yet — still awaiting review

    const reviewed = await service.reviewItemResult(instance.id, items[0].id, organizationId, instructorId, { status: 'approved' });
    expect(reviewed.status).toBe('completed');
    expect(reviewed.totalScore).toBe(10);
    expect(reviewed.passed).toBe(true);
  });

  it('zeroes out a rejected item so it does not count toward the total score', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'С проверкой', scoringMode: 'sum_points', passThreshold: 50, requiresReview: true },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт 1', points: 10, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);

    await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { checked: true });
    const reviewed = await service.reviewItemResult(instance.id, items[0].id, organizationId, instructorId, {
      status: 'rejected',
      comment: 'Фото не подтверждает выполнение',
    });

    expect(reviewed.totalScore).toBe(0);
    expect(reviewed.passed).toBe(false);
  });

  it('refuses to review an instance that is not awaiting review', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'Без проверки', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт 1', points: 10, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);

    await expect(
      service.reviewItemResult(instance.id, 'nonexistent-item', organizationId, instructorId, { status: 'approved' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChecklistsService — ownership and validation guards', () => {
  it('prevents a learner from filling out another learner\'s assignment', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    const checklist = await service.createChecklist(
      { organizationId, title: 'Тест', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт', points: 10, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);

    await expect(
      service.submitItemResult(instance.id, items[0].id, organizationId, 'someone-else', false, { checked: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to publish a checklist with no items', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);
    const checklist = await service.createChecklist(
      { organizationId, title: 'Пустой', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );

    await expect(service.updateChecklist(checklist.id, organizationId, { status: 'published' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to publish a scale-mode checklist with fewer than 2 levels', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);
    const checklist = await service.createChecklist(
      { organizationId, title: 'Шкала', scoringMode: 'scale', passThreshold: 50, requiresReview: false, scaleLevels: [{ level: 1, label: 'Единственный', points: 10 }] },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт', points: 0, isRequired: true, photoRequired: false });

    await expect(service.updateChecklist(checklist.id, organizationId, { status: 'published' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to assign an unpublished checklist', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);
    const checklist = await service.createChecklist(
      { organizationId, title: 'Черновик', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );

    await expect(service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException for a checklist outside the caller\'s organization', async () => {
    const prisma = createFakePrisma();
    const service = new ChecklistsService(prisma);

    await expect(service.getChecklist('missing', organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChecklistsService — item photo attachment', () => {
  function createFakeUploadService() {
    return {
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getInlinePresignedUrl: jest.fn().mockResolvedValue('https://files.example.com/signed-photo'),
    };
  }

  async function setUpCheckedInstance(prisma: ReturnType<typeof createFakePrisma>, uploadService: ReturnType<typeof createFakeUploadService>) {
    const service = new ChecklistsService(prisma, uploadService as never);
    const checklist = await service.createChecklist(
      { organizationId, title: 'С фото', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт с фото', points: 10, isRequired: true, photoRequired: true });
    await service.createItem(checklist.id, organizationId, { text: 'Пункт без фото', points: 10, isRequired: true, photoRequired: false });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);
    // Leave the second item unanswered so the instance stays editable while the photo is attached
    // (photoRequired isn't enforced when computing "answered", so checking the last item would
    // otherwise complete — and lock — the instance before a photo can be attached).
    await service.submitItemResult(instance.id, items[0].id, organizationId, learnerId, false, { checked: true });
    return { service, instance, item: items[0] };
  }

  it('rejects attaching a photo before the item has been marked', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const service = new ChecklistsService(prisma, uploadService as never);
    const checklist = await service.createChecklist(
      { organizationId, title: 'С фото', scoringMode: 'sum_points', passThreshold: 50, requiresReview: false },
      instructorId,
    );
    await service.createItem(checklist.id, organizationId, { text: 'Пункт', points: 10, isRequired: true, photoRequired: true });
    await service.updateChecklist(checklist.id, organizationId, { status: 'published' });
    const instance = await service.assignChecklist(checklist.id, organizationId, { userId: learnerId }, instructorId);
    const items = await service.listItems(checklist.id, organizationId);

    await expect(
      service.attachItemPhoto(instance.id, items[0].id, organizationId, learnerId, false, {
        objectKey: 'key-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attaches a photo to an already-marked item', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const { service, instance, item } = await setUpCheckedInstance(prisma, uploadService);

    await service.attachItemPhoto(instance.id, item.id, organizationId, learnerId, false, {
      objectKey: 'key-1',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });

    const result = await prisma.checklistItemResult.findUnique({ where: { instanceId_itemId: { instanceId: instance.id, itemId: item.id } } });
    expect(result?.photoFileName).toBe('photo.jpg');
    expect(uploadService.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes the previous photo object when replacing an attached photo', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const { service, instance, item } = await setUpCheckedInstance(prisma, uploadService);

    await service.attachItemPhoto(instance.id, item.id, organizationId, learnerId, false, {
      objectKey: 'key-1',
      fileName: 'first.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });
    await service.attachItemPhoto(instance.id, item.id, organizationId, learnerId, false, {
      objectKey: 'key-2',
      fileName: 'second.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1200,
    });

    expect(uploadService.deleteObject).toHaveBeenCalledWith('key-1');
  });

  it('prevents a learner from attaching a photo to another learner\'s assignment', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const { service, instance, item } = await setUpCheckedInstance(prisma, uploadService);

    await expect(
      service.attachItemPhoto(instance.id, item.id, organizationId, 'someone-else', false, {
        objectKey: 'key-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a presigned URL for an attached photo', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const { service, instance, item } = await setUpCheckedInstance(prisma, uploadService);
    await service.attachItemPhoto(instance.id, item.id, organizationId, learnerId, false, {
      objectKey: 'key-1',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });

    const download = await service.getItemPhotoDownload(instance.id, item.id, organizationId, learnerId, false);

    expect(download.url).toBe('https://files.example.com/signed-photo');
    expect(uploadService.getInlinePresignedUrl).toHaveBeenCalledWith('key-1', 'image/jpeg', 300);
  });

  it('throws NotFoundException when no photo has been attached', async () => {
    const prisma = createFakePrisma();
    const uploadService = createFakeUploadService();
    const { service, instance, item } = await setUpCheckedInstance(prisma, uploadService);

    await expect(
      service.getItemPhotoDownload(instance.id, item.id, organizationId, learnerId, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
