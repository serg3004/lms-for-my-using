import { PrismaService } from '../../database/prisma.service.js';
import { ReportsService } from './reports.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';

type Call = { resource: string; method: string; args: Record<string, unknown> };

function createPrismaSpy(overrides: {
  progressFindMany?: unknown[];
  certificateFindMany?: unknown[];
  assignmentFindMany?: unknown[];
  progressTotal?: number;
  progressCompletedTotal?: number;
  progressAvgScore?: number | null;
  certificatesIssuedTotal?: number;
  overdueTotal?: number;
} = {}) {
  const calls: Call[] = [];
  const record = (resource: string, method: string, result: unknown) => async (args: Record<string, unknown>) => {
    calls.push({ resource, method, args });
    return result;
  };

  const prisma = {
    progress: {
      findMany: record('progress', 'findMany', overrides.progressFindMany ?? []),
      count: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'progress', method: 'count', args });
        const where = args.where as { status?: string };
        return where?.status === 'completed' ? overrides.progressCompletedTotal ?? 0 : overrides.progressTotal ?? 0;
      },
      aggregate: record('progress', 'aggregate', { _avg: { score: overrides.progressAvgScore ?? null } }),
    },
    certificate: {
      findMany: record('certificate', 'findMany', overrides.certificateFindMany ?? []),
      count: record('certificate', 'count', overrides.certificatesIssuedTotal ?? 0),
    },
    assignment: {
      findMany: record('assignment', 'findMany', overrides.assignmentFindMany ?? []),
      count: record('assignment', 'count', overrides.overdueTotal ?? 0),
    },
  } as unknown as PrismaService;

  return { prisma, calls };
}

describe('ReportsService', () => {
  it('computes admin dashboard KPI from full-dataset counts while bounding activity queries', async () => {
    const calls: Call[] = [];
    const record = (resource: string, method: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ resource, method, args });
      return result;
    };
    let progressCountCall = 0;
    const prisma = {
      user: {
        count: async (args: Record<string, unknown>) => {
          calls.push({ resource: 'user', method: 'count', args });
          return (args.where as { status?: string }).status === 'invited' ? 17 : 140;
        },
        findMany: record('user', 'findMany', []),
      },
      course: { count: record('course', 'count', 12) },
      progress: {
        count: async (args: Record<string, unknown>) => {
          calls.push({ resource: 'progress', method: 'count', args });
          progressCountCall += 1;
          return progressCountCall === 1 ? 250 : 180;
        },
        findMany: record('progress', 'findMany', []),
      },
      certificate: {
        count: record('certificate', 'count', 45),
        findMany: record('certificate', 'findMany', []),
      },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).getAdminDashboard({ id: 'admin-1', organizationId, roles: ['admin'] });

    expect(result).toMatchObject({
      usersTotal: 140,
      coursesTotal: 12,
      completionRate: 72,
      certificatesTotal: 45,
      pendingActivationCount: 17,
    });
    expect(calls.filter((call) => call.method === 'findMany')).toHaveLength(3);
    expect(calls.filter((call) => call.method === 'findMany').every((call) => call.args.take === 5)).toBe(true);
    expect(calls.every((call) => (call.args.where as { organizationId?: string }).organizationId === organizationId)).toBe(true);
  });

  it('returns bounded lists plus database-computed counts, scoped to the actor organization', async () => {
    const { prisma, calls } = createPrismaSpy({
      progressFindMany: [{ id: 'progress-1' }],
      certificateFindMany: [{ id: 'certificate-1' }],
      assignmentFindMany: [{ id: 'assignment-1' }],
      progressTotal: 250,
      progressCompletedTotal: 180,
      progressAvgScore: 82,
      certificatesIssuedTotal: 40,
      overdueTotal: 12,
    });

    const result = await new ReportsService(prisma).getSummary({ id: 'admin-1', organizationId, roles: ['admin'] });

    expect(result).toEqual({
      progress: [{ id: 'progress-1' }],
      certificates: [{ id: 'certificate-1' }],
      overdueAssignments: [{ id: 'assignment-1' }],
      counts: {
        progressTotal: 250,
        progressCompletedTotal: 180,
        progressAvgScore: 82,
        certificatesIssuedTotal: 40,
        overdueTotal: 12,
      },
    });

    const findManyCalls = calls.filter((call) => call.method === 'findMany');
    expect(findManyCalls).toHaveLength(3);
    for (const call of calls) {
      expect(call.args.where).toMatchObject({ organizationId, deletedAt: null });
    }
    for (const call of findManyCalls) {
      expect(call.args.take).toBe(100);
    }
    expect(calls.find((call) => call.resource === 'assignment' && call.method === 'findMany')?.args.where).toMatchObject({
      status: 'assigned',
      dueAt: { lt: expect.any(Date) },
    });
    expect(calls.find((call) => call.resource === 'certificate' && call.method === 'count')?.args.where).toMatchObject({
      status: 'issued',
    });
  });

  it('bounds every list query with a stable order and does not load the full dataset for counts', async () => {
    const { prisma, calls } = createPrismaSpy();

    await new ReportsService(prisma).getSummary({ id: 'admin-1', organizationId, roles: ['admin'] });

    const progressFindMany = calls.find((call) => call.resource === 'progress' && call.method === 'findMany');
    expect(progressFindMany?.args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);

    const certificateFindMany = calls.find((call) => call.resource === 'certificate' && call.method === 'findMany');
    expect(certificateFindMany?.args.orderBy).toEqual([{ issuedAt: 'desc' }, { id: 'asc' }]);

    const assignmentFindMany = calls.find((call) => call.resource === 'assignment' && call.method === 'findMany');
    expect(assignmentFindMany?.args.orderBy).toEqual([{ dueAt: 'asc' }, { id: 'asc' }]);

    // Aggregate paths must exist and be scoped — they are what keep counts correct
    // without loading every row (the actual bug this PR fixes).
    expect(calls.some((call) => call.resource === 'progress' && call.method === 'count')).toBe(true);
    expect(calls.some((call) => call.resource === 'progress' && call.method === 'aggregate')).toBe(true);
    expect(calls.some((call) => call.resource === 'certificate' && call.method === 'count')).toBe(true);
    expect(calls.some((call) => call.resource === 'assignment' && call.method === 'count')).toBe(true);
  });

  it('applies manager team ownership to progress, certificates, and assignments across list and count queries', async () => {
    const { prisma, calls } = createPrismaSpy();

    await new ReportsService(prisma).getSummary({ id: 'manager-1', organizationId, roles: ['manager'] });

    const progressWheres = calls.filter((call) => call.resource === 'progress').map((call) => call.args.where);
    const certificateWheres = calls.filter((call) => call.resource === 'certificate').map((call) => call.args.where);
    const assignmentWheres = calls.filter((call) => call.resource === 'assignment').map((call) => call.args.where);

    for (const where of progressWheres) {
      expect(where).toMatchObject({ user: { groupMemberships: { some: { organizationId } } } });
    }
    for (const where of certificateWheres) {
      expect(where).toMatchObject({ user: { groupMemberships: { some: { organizationId } } } });
    }
    for (const where of assignmentWheres) {
      expect(where).toMatchObject({ OR: expect.any(Array) });
    }
  });

  it('reports a null average score when no progress has a score yet', async () => {
    const { prisma } = createPrismaSpy({ progressAvgScore: null });

    const result = await new ReportsService(prisma).getSummary({ id: 'admin-1', organizationId, roles: ['admin'] });

    expect(result.counts.progressAvgScore).toBeNull();
  });
});
