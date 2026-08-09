import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { reorderLessonsSchema } from './lessons.schemas.js';
import { LessonsService } from './lessons.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const firstLessonId = '33333333-3333-3333-3333-333333333333';
const secondLessonId = '44444444-4444-4444-4444-444444444444';

describe('LessonsService CRUD order', () => {
  it('accepts valid lesson reorder input', () => {
    expect(reorderLessonsSchema.parse({ lessonIds: [firstLessonId, secondLessonId] })).toEqual({
      lessonIds: [firstLessonId, secondLessonId],
    });
  });

  it('rejects empty lesson reorder input', () => {
    expect(() => reorderLessonsSchema.parse({ lessonIds: [] })).toThrow();
  });

  it('soft deletes a lesson when it exists', async () => {
    const update = jest.fn(async () => ({ id: firstLessonId }));
    const prisma = {
      lesson: {
        findFirst: async () => ({ id: firstLessonId, slug: 'first-lesson' }),
        update,
      },
    } as unknown as PrismaService;
    const service = new LessonsService(prisma);

    await expect(service.deleteLesson(firstLessonId, organizationId)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: firstLessonId, organizationId },
        data: { deletedAt: expect.any(Date), slug: expect.stringMatching(new RegExp(`^first-lesson--deleted-${firstLessonId}-`)) },
      }),
    );
  });

  it('throws NotFoundException when deleting missing lesson', async () => {
    const prisma = {
      lesson: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new LessonsService(prisma);

    await expect(service.deleteLesson(firstLessonId, organizationId)).rejects.toThrow(NotFoundException);
  });

  it('reorders all active lessons in a course', async () => {
    const transaction = jest.fn(async () => []);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: firstLessonId }, { id: secondLessonId }] as never)
      .mockResolvedValueOnce([
        { id: secondLessonId, order: 0 },
        { id: firstLessonId, order: 1 },
      ] as never);
    const update = jest.fn((args) => args);
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId }),
      },
      lesson: {
        findMany,
        update,
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new LessonsService(prisma);

    await expect(service.reorderLessons(courseId, organizationId, [secondLessonId, firstLessonId])).resolves.toEqual([
      { id: secondLessonId, order: 0 },
      { id: firstLessonId, order: 1 },
    ]);
    expect(transaction).toHaveBeenCalled();
  });

  it('rejects lesson reorder payload with missing active lessons', async () => {
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId }),
      },
      lesson: {
        findMany: async () => [{ id: firstLessonId }, { id: secondLessonId }],
      },
    } as unknown as PrismaService;
    const service = new LessonsService(prisma);

    await expect(service.reorderLessons(courseId, organizationId, [firstLessonId])).rejects.toThrow(BadRequestException);
  });
});
