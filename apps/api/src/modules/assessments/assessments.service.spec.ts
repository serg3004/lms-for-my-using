import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { createAssessmentSchema, updateAssessmentSchema, updateAssessmentStatusSchema } from './assessments.schemas.js';
import { AssessmentsService } from './assessments.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const assessmentId = '22222222-2222-2222-2222-222222222222';

describe('Assessments validation', () => {
  it('accepts valid assessment input for future automatic grading', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
      status: 'draft',
      passingScore: 70,
      availableAfterCourseCompletion: true,
      showCorrectAnswers: false,
      randomizeOrder: false,
    });
  });

  it('accepts valid assessment input with lesson and attempts limit', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '33333333-3333-3333-3333-333333333333',
      title: 'Lesson quiz',
      slug: 'lesson-quiz',
      passingScore: 80,
      maxAttempts: 3,
      availableAfterCourseCompletion: false,
    });

    expect(input.lessonId).toBe('33333333-3333-3333-3333-333333333333');
    expect(input.passingScore).toBe(80);
    expect(input.maxAttempts).toBe(3);
    expect(input.availableAfterCourseCompletion).toBe(false);
  });

  it('accepts a timeLimitMinutes value', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Timed test',
      slug: 'timed-test',
      timeLimitMinutes: 30,
    });

    expect(input.timeLimitMinutes).toBe(30);
  });

  it('accepts custom pass/fail result messages', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
      passMessage: 'Great job, you passed!',
      failMessage: 'Not quite — review the material and try again.',
    });

    expect(input.passMessage).toBe('Great job, you passed!');
    expect(input.failMessage).toBe('Not quite — review the material and try again.');
  });

  it('accepts a showCorrectAnswers flag, defaulting to false', () => {
    const defaultInput = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
    });
    expect(defaultInput.showCorrectAnswers).toBe(false);

    const explicitInput = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
      showCorrectAnswers: true,
    });
    expect(explicitInput.showCorrectAnswers).toBe(true);
  });

  it('accepts a randomizeOrder flag, defaulting to false', () => {
    const defaultInput = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
    });
    expect(defaultInput.randomizeOrder).toBe(false);

    const explicitInput = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
      randomizeOrder: true,
    });
    expect(explicitInput.randomizeOrder).toBe(true);
  });

  it('rejects assessment input without title', () => {
    expect(() =>
      createAssessmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        slug: 'final-test',
      }),
    ).toThrow();
  });

  it('rejects invalid passing score', () => {
    expect(() =>
      createAssessmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        title: 'Final test',
        slug: 'final-test',
        passingScore: 101,
      }),
    ).toThrow();
  });
});

describe('updateAssessmentStatusSchema', () => {
  it('accepts valid status', () => {
    expect(updateAssessmentStatusSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('rejects unknown status', () => {
    expect(() => updateAssessmentStatusSchema.parse({ status: 'active' })).toThrow();
  });
});

describe('updateAssessmentSchema', () => {
  it('accepts partial update', () => {
    expect(updateAssessmentSchema.parse({ passingScore: 80, status: 'published' })).toEqual({
      passingScore: 80,
      status: 'published',
    });
  });

  it('accepts maxAttempts null to remove limit', () => {
    expect(updateAssessmentSchema.parse({ maxAttempts: null })).toEqual({ maxAttempts: null });
  });

  it('accepts timeLimitMinutes null to remove the time limit', () => {
    expect(updateAssessmentSchema.parse({ timeLimitMinutes: null })).toEqual({ timeLimitMinutes: null });
  });

  it('accepts pass/fail message null to revert to the default text', () => {
    expect(updateAssessmentSchema.parse({ passMessage: null, failMessage: null })).toEqual({ passMessage: null, failMessage: null });
  });

  it('accepts empty object', () => {
    expect(updateAssessmentSchema.parse({})).toEqual({});
  });
});

describe('AssessmentsService.updateAssessmentStatus publish guard', () => {
  it('rejects publishing an assessment with no questions', async () => {
    const update = jest.fn();
    const prisma = {
      assessment: { findFirst: async () => ({ id: assessmentId }), update },
      assessmentQuestion: { findMany: async () => [] },
    } as unknown as PrismaService;
    const service = new AssessmentsService(prisma);

    await expect(service.updateAssessmentStatus(assessmentId, organizationId, 'published')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects publishing when a question has no correct answer option', async () => {
    const update = jest.fn();
    const prisma = {
      assessment: { findFirst: async () => ({ id: assessmentId }), update },
      assessmentQuestion: {
        findMany: async () => [
          { title: 'Q1', options: [{ id: 'opt-1' }] },
          { title: 'Q2 (no correct option)', options: [] },
        ],
      },
    } as unknown as PrismaService;
    const service = new AssessmentsService(prisma);

    await expect(service.updateAssessmentStatus(assessmentId, organizationId, 'published')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('publishes when every question has at least one correct answer option', async () => {
    const updatedAssessment = { id: assessmentId, status: 'published' };
    const prisma = {
      assessment: { findFirst: async () => ({ id: assessmentId }), update: async () => updatedAssessment },
      assessmentQuestion: {
        findMany: async () => [
          { title: 'Q1', options: [{ id: 'opt-1' }] },
          { title: 'Q2', options: [{ id: 'opt-2' }] },
        ],
      },
    } as unknown as PrismaService;
    const service = new AssessmentsService(prisma);

    await expect(service.updateAssessmentStatus(assessmentId, organizationId, 'published')).resolves.toEqual(
      updatedAssessment,
    );
  });

  it('does not run the guard when changing status to something other than published', async () => {
    const findMany = jest.fn(async () => []);
    const updatedAssessment = { id: assessmentId, status: 'archived' };
    const prisma = {
      assessment: { findFirst: async () => ({ id: assessmentId }), update: async () => updatedAssessment },
      assessmentQuestion: { findMany },
    } as unknown as PrismaService;
    const service = new AssessmentsService(prisma);

    await expect(service.updateAssessmentStatus(assessmentId, organizationId, 'archived')).resolves.toEqual(updatedAssessment);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the assessment does not exist', async () => {
    const prisma = { assessment: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new AssessmentsService(prisma);

    await expect(service.updateAssessmentStatus(assessmentId, organizationId, 'published')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AssessmentsService.deleteAssessment', () => {
  function buildTxPrisma(options: {
    rows: { id: string; slug: string; timeLimitMinutes?: number | null }[];
    activeAttempt?: { id: string } | null;
    findFirst?: jest.Mock;
    update?: jest.Mock;
  }) {
    const update = options.update ?? jest.fn(async () => ({ id: assessmentId }));
    const findFirst = options.findFirst ?? jest.fn(async () => options.activeAttempt ?? null);
    const tx = {
      $queryRaw: jest.fn(async () => options.rows.map((row) => ({ timeLimitMinutes: null, ...row }))),
      assessmentAttempt: { findFirst },
      assessment: { update },
    };
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService;

    return { prisma, tx, update, findFirst };
  }

  it('soft-deletes the assessment, guarding against in-progress attempts inside a row-locked transaction', async () => {
    const { prisma, update } = buildTxPrisma({ rows: [{ id: assessmentId, slug: 'final-test' }], activeAttempt: null });
    const service = new AssessmentsService(prisma);

    await service.deleteAssessment(assessmentId, organizationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assessmentId, organizationId },
        data: { deletedAt: expect.any(Date), slug: expect.stringMatching(new RegExp(`^final-test--deleted-${assessmentId}-`)) },
      }),
    );
  });

  it('throws NotFoundException when the assessment does not exist', async () => {
    const { prisma, update } = buildTxPrisma({ rows: [] });
    const service = new AssessmentsService(prisma);

    await expect(service.deleteAssessment(assessmentId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects deleting an assessment with an attempt in progress that is still within its time limit', async () => {
    const { prisma, update, findFirst } = buildTxPrisma({
      rows: [{ id: assessmentId, slug: 'final-test', timeLimitMinutes: 10 }],
      activeAttempt: { id: 'attempt-id' },
    });
    const service = new AssessmentsService(prisma);

    await expect(service.deleteAssessment(assessmentId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assessmentId, status: 'in_progress', startedAt: { gt: expect.any(Date) } }),
      }),
    );
  });

  it('allows deleting when the only in_progress attempt has already expired past its time limit', async () => {
    // The DB-level startedAt filter is what actually excludes an expired attempt — simulated
    // here by returning null, as if the WHERE clause found no in_progress row within the window.
    const { prisma, update } = buildTxPrisma({
      rows: [{ id: assessmentId, slug: 'final-test', timeLimitMinutes: 10 }],
      activeAttempt: null,
    });
    const service = new AssessmentsService(prisma);

    await service.deleteAssessment(assessmentId, organizationId);

    expect(update).toHaveBeenCalled();
  });

  it('blocks deleting on any in_progress attempt when the assessment no longer has a time limit to expire against', async () => {
    const { prisma, update, findFirst } = buildTxPrisma({
      rows: [{ id: assessmentId, slug: 'final-test', timeLimitMinutes: null }],
      activeAttempt: { id: 'attempt-id' },
    });
    const service = new AssessmentsService(prisma);

    await expect(service.deleteAssessment(assessmentId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assessmentId, status: 'in_progress', deletedAt: null },
      }),
    );
  });
});
