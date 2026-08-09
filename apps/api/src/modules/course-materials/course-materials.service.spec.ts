import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import {
  createCourseMaterialSchema,
  updateCourseMaterialSchema,
  updateCourseMaterialStatusSchema,
} from './course-materials.schemas.js';
import { CourseMaterialsService } from './course-materials.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const materialId = '44444444-4444-4444-4444-444444444444';
const lessonId = '33333333-3333-3333-3333-333333333333';

describe('Course materials validation', () => {
  it('accepts valid course material input without lesson', () => {
    const input = createCourseMaterialSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Safety PDF',
      slug: 'safety-pdf',
      fileUrl: 'https://example.com/safety.pdf',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Safety PDF',
      slug: 'safety-pdf',
      kind: 'file',
      fileUrl: 'https://example.com/safety.pdf',
      status: 'active',
    });
  });

  it('accepts valid course material input with lesson', () => {
    const input = createCourseMaterialSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '33333333-3333-3333-3333-333333333333',
      title: 'Intro Video',
      slug: 'intro-video',
      kind: 'link',
      fileUrl: 'https://example.com/intro',
    });

    expect(input.lessonId).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('rejects invalid material slug', () => {
    expect(() =>
      createCourseMaterialSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        title: 'Safety PDF',
        slug: 'Safety PDF',
        fileUrl: 'https://example.com/safety.pdf',
      }),
    ).toThrow();
  });
});

describe('updateCourseMaterialStatusSchema', () => {
  it('accepts valid status', () => {
    expect(updateCourseMaterialStatusSchema.parse({ status: 'archived' })).toEqual({ status: 'archived' });
  });

  it('rejects unknown status', () => {
    expect(() => updateCourseMaterialStatusSchema.parse({ status: 'draft' })).toThrow();
  });
});

describe('updateCourseMaterialSchema', () => {
  it('accepts partial update with title and fileUrl', () => {
    expect(
      updateCourseMaterialSchema.parse({ title: 'Updated Title', fileUrl: 'https://example.com/new.pdf' }),
    ).toEqual({ title: 'Updated Title', fileUrl: 'https://example.com/new.pdf' });
  });

  it('accepts description null to clear it', () => {
    expect(updateCourseMaterialSchema.parse({ description: null })).toEqual({ description: null });
  });

  it('accepts empty object (no-op update)', () => {
    expect(updateCourseMaterialSchema.parse({})).toEqual({});
  });

  it('accepts lessonId to (re)assign a material to a lesson', () => {
    expect(updateCourseMaterialSchema.parse({ lessonId })).toEqual({ lessonId });
  });

  it('accepts lessonId null to unassign a material from its lesson', () => {
    expect(updateCourseMaterialSchema.parse({ lessonId: null })).toEqual({ lessonId: null });
  });
});

describe('CourseMaterialsService.updateCourseMaterial lessonId (re)assignment', () => {
  it('validates the new lessonId belongs to the material\'s course before reassigning', async () => {
    const update = jest.fn(async () => ({ id: materialId, lessonId }));
    const prisma = {
      courseMaterial: {
        findFirst: async () => ({ id: materialId, courseId }),
        update,
      },
      lesson: { findFirst: async () => ({ id: lessonId }) },
    } as unknown as PrismaService;
    const service = new CourseMaterialsService(prisma);

    await service.updateCourseMaterial(materialId, organizationId, { lessonId });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lessonId } }));
  });

  it('rejects reassigning to a lesson from a different course', async () => {
    const prisma = {
      courseMaterial: { findFirst: async () => ({ id: materialId, courseId }) },
      lesson: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new CourseMaterialsService(prisma);

    await expect(service.updateCourseMaterial(materialId, organizationId, { lessonId })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows clearing lessonId (unassign) without a lesson lookup', async () => {
    const update = jest.fn(async () => ({ id: materialId, lessonId: null }));
    const lessonFindFirst = jest.fn(async () => ({ id: lessonId }));
    const prisma = {
      courseMaterial: {
        findFirst: async () => ({ id: materialId, courseId }),
        update,
      },
      lesson: { findFirst: lessonFindFirst },
    } as unknown as PrismaService;
    const service = new CourseMaterialsService(prisma);

    await service.updateCourseMaterial(materialId, organizationId, { lessonId: null });

    expect(lessonFindFirst).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lessonId: null } }));
  });
});

describe('CourseMaterialsService.deleteCourseMaterial', () => {
  it('soft-deletes the material', async () => {
    const update = jest.fn(async () => ({ id: materialId }));
    const prisma = {
      courseMaterial: {
        findFirst: async () => ({ id: materialId, slug: 'safety-pdf' }),
        update,
      },
    } as unknown as PrismaService;
    const service = new CourseMaterialsService(prisma);

    await service.deleteCourseMaterial(materialId, organizationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: materialId, organizationId },
        data: { deletedAt: expect.any(Date), slug: `safety-pdf--deleted-${materialId}` },
      }),
    );
  });

  it('throws NotFoundException when the material does not exist', async () => {
    const prisma = { courseMaterial: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new CourseMaterialsService(prisma);

    await expect(service.deleteCourseMaterial(materialId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
