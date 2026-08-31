import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { LearningTargetResolverService } from './learning-target-resolver.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const userId = '22222222-2222-2222-2222-222222222222';
const courseId = '33333333-3333-3333-3333-333333333333';
const departmentId = '44444444-4444-4444-4444-444444444444';
const positionId = '55555555-5555-5555-5555-555555555555';

function createPrisma(overrides: {
  course?: Partial<Record<'findFirst', jest.Mock>>;
  departmentMembership?: Partial<Record<'findFirst', jest.Mock>>;
  assignment?: Partial<Record<'findMany', jest.Mock>>;
  positionCourse?: Partial<Record<'findFirst', jest.Mock>>;
  queryRaw?: jest.Mock;
} = {}) {
  return {
    course: { findFirst: jest.fn(async () => ({ selfEnrollmentEnabled: false })), ...overrides.course },
    departmentMembership: { findFirst: jest.fn(async () => null), ...overrides.departmentMembership },
    assignment: { findMany: jest.fn(async () => []), ...overrides.assignment },
    positionCourse: { findFirst: jest.fn(async () => null), ...overrides.positionCourse },
    $queryRaw: overrides.queryRaw ?? jest.fn(async () => []),
  } as unknown as PrismaService;
}

function assignmentFindManyByShape(direct: unknown[], group: unknown[], department: unknown[]) {
  return jest.fn(async (args: { where: Record<string, unknown> }) => {
    if ('userId' in args.where) return direct;
    if ('group' in args.where) return group;
    if ('departmentId' in args.where) return department;
    return [];
  });
}

describe('LearningTargetResolverService', () => {
  it('returns no entitlement when nothing matches', async () => {
    const prisma = createPrisma();
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution).toEqual({ sources: [], isEntitled: false, effectiveRequirement: null, effectiveDueAt: null, displaySource: null });
  });

  it('resolves a DIRECT_ASSIGNMENT source', async () => {
    const prisma = createPrisma({
      assignment: { findMany: assignmentFindManyByShape([{ id: 'assignment-1', dueAt: null }], [], []) },
    });
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution.isEntitled).toBe(true);
    expect(resolution.sources).toEqual([{ type: 'DIRECT_ASSIGNMENT', id: 'assignment-1', requirement: 'REQUIRED', dueAt: null }]);
  });

  it('resolves a GROUP source', async () => {
    const prisma = createPrisma({
      assignment: { findMany: assignmentFindManyByShape([], [{ id: 'assignment-2', dueAt: null }], []) },
    });
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution.sources).toEqual([{ type: 'GROUP', id: 'assignment-2', requirement: 'REQUIRED', dueAt: null }]);
  });

  it('resolves SELF_ENROLLMENT when the course allows it, even with no membership', async () => {
    const prisma = createPrisma({ course: { findFirst: jest.fn(async () => ({ selfEnrollmentEnabled: true })) } });
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution.sources).toEqual([{ type: 'SELF_ENROLLMENT', id: courseId, requirement: 'OPTIONAL', dueAt: null }]);
  });

  it('does not resolve DEPARTMENT or POSITION sources without a current primary membership', async () => {
    const prisma = createPrisma({
      departmentMembership: { findFirst: jest.fn(async () => null) },
      assignment: {
        findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
          if ('departmentId' in args.where) throw new Error('should not query department-targeted assignments without a membership');
          return [];
        }),
      },
    });
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution.isEntitled).toBe(false);
  });

  describe('DEPARTMENT source', () => {
    it('matches a direct (non-descendant) department assignment', async () => {
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId: null, effectiveFrom: new Date() })) },
        assignment: {
          findMany: assignmentFindManyByShape(
            [],
            [],
            [{ id: 'assignment-3', departmentId, includeDescendants: false, dueAt: null }],
          ),
        },
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.sources).toEqual([{ type: 'DEPARTMENT', id: 'assignment-3', requirement: 'REQUIRED', dueAt: null }]);
    });

    it('does not match a different department when includeDescendants is false', async () => {
      const otherDepartmentId = '66666666-6666-6666-6666-666666666666';
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId: null, effectiveFrom: new Date() })) },
        assignment: {
          findMany: assignmentFindManyByShape(
            [],
            [],
            [{ id: 'assignment-4', departmentId: otherDepartmentId, includeDescendants: false, dueAt: null }],
          ),
        },
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.isEntitled).toBe(false);
    });

    it('matches a descendant department when includeDescendants is true', async () => {
      const rootDepartmentId = '77777777-7777-7777-7777-777777777777';
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId: null, effectiveFrom: new Date() })) },
        assignment: {
          findMany: assignmentFindManyByShape(
            [],
            [],
            [{ id: 'assignment-5', departmentId: rootDepartmentId, includeDescendants: true, dueAt: null }],
          ),
        },
        queryRaw: jest.fn(async () => [{ id: departmentId }]),
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.sources).toEqual([{ type: 'DEPARTMENT', id: 'assignment-5', requirement: 'REQUIRED', dueAt: null }]);
    });

    it('does not match outside the subtree even with includeDescendants true', async () => {
      const rootDepartmentId = '77777777-7777-7777-7777-777777777777';
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId: null, effectiveFrom: new Date() })) },
        assignment: {
          findMany: assignmentFindManyByShape(
            [],
            [],
            [{ id: 'assignment-6', departmentId: rootDepartmentId, includeDescendants: true, dueAt: null }],
          ),
        },
        queryRaw: jest.fn(async () => []),
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.isEntitled).toBe(false);
    });
  });

  describe('POSITION source', () => {
    it('resolves a due date as membership.effectiveFrom + dueDays', async () => {
      const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId, effectiveFrom })) },
        positionCourse: {
          findFirst: jest.fn(async () => ({ id: 'pc-1', requirement: 'OPTIONAL', dueDays: 10 })),
        },
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.sources).toEqual([
        { type: 'POSITION', id: 'pc-1', requirement: 'OPTIONAL', dueAt: new Date('2026-01-11T00:00:00.000Z') },
      ]);
    });

    it('resolves a null due date when dueDays is not set', async () => {
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId, effectiveFrom: new Date() })) },
        positionCourse: { findFirst: jest.fn(async () => ({ id: 'pc-2', requirement: 'REQUIRED', dueDays: null })) },
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.sources).toEqual([{ type: 'POSITION', id: 'pc-2', requirement: 'REQUIRED', dueAt: null }]);
    });

    it('does not resolve a POSITION source when the membership has no position', async () => {
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ departmentId, positionId: null, effectiveFrom: new Date() })) },
      });
      const service = new LearningTargetResolverService(prisma);

      const resolution = await service.resolveForUser(organizationId, userId, courseId);

      expect(resolution.isEntitled).toBe(false);
    });
  });

  it('dedupes the same (type, id) pair defensively, even if a query layer ever returned it twice', async () => {
    // No current code path produces a genuine duplicate (each resolver method issues one
    // findFirst/findMany per source type), but the dedupe step is a deliberate safety net --
    // this proves it actually collapses a would-be duplicate rather than merely being unused.
    const prisma = createPrisma({
      assignment: { findMany: assignmentFindManyByShape([{ id: 'assignment-1', dueAt: null }, { id: 'assignment-1', dueAt: null }], [], []) },
    });
    const service = new LearningTargetResolverService(prisma);

    const resolution = await service.resolveForUser(organizationId, userId, courseId);

    expect(resolution.sources).toHaveLength(1);
  });

  it('keeps entitlement when one source is removed but another remains', async () => {
    const bothSources = createPrisma({
      assignment: { findMany: assignmentFindManyByShape([{ id: 'assignment-1', dueAt: null }], [{ id: 'assignment-2', dueAt: null }], []) },
    });
    const resolutionWithBoth = await new LearningTargetResolverService(bothSources).resolveForUser(organizationId, userId, courseId);
    expect(resolutionWithBoth.sources).toHaveLength(2);

    // The DIRECT_ASSIGNMENT is gone (e.g. closed), but GROUP remains -- still entitled.
    const onlyGroup = createPrisma({
      assignment: { findMany: assignmentFindManyByShape([], [{ id: 'assignment-2', dueAt: null }], []) },
    });
    const resolutionAfterRemoval = await new LearningTargetResolverService(onlyGroup).resolveForUser(organizationId, userId, courseId);

    expect(resolutionAfterRemoval.isEntitled).toBe(true);
    expect(resolutionAfterRemoval.sources).toEqual([{ type: 'GROUP', id: 'assignment-2', requirement: 'REQUIRED', dueAt: null }]);
  });
});
