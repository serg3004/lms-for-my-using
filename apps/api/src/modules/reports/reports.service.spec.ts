import { PrismaService } from '../../database/prisma.service.js';
import { ReportsService } from './reports.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';

describe('ReportsService', () => {
  it('returns real report data and limits every query to the actor organization', async () => {
    const calls: Array<{ resource: string; args: Record<string, unknown> }> = [];
    const prisma = {
      progress: { findMany: async (args: Record<string, unknown>) => { calls.push({ resource: 'progress', args }); return [{ id: 'progress-1' }]; } },
      certificate: { findMany: async (args: Record<string, unknown>) => { calls.push({ resource: 'certificate', args }); return [{ id: 'certificate-1' }]; } },
      assignment: { findMany: async (args: Record<string, unknown>) => { calls.push({ resource: 'assignment', args }); return [{ id: 'assignment-1' }]; } },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).getSummary({ id: 'admin-1', organizationId, roles: ['admin'] });

    expect(result).toEqual({
      progress: [{ id: 'progress-1' }],
      certificates: [{ id: 'certificate-1' }],
      overdueAssignments: [{ id: 'assignment-1' }],
    });
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.args.where).toMatchObject({ organizationId, deletedAt: null });
    }
    expect(calls.find((call) => call.resource === 'assignment')?.args.where).toMatchObject({
      status: 'assigned',
      dueAt: { lt: expect.any(Date) },
    });
  });

  it('applies manager team ownership to progress, certificates, and assignments', async () => {
    const where: unknown[] = [];
    const record = (args: { where: unknown }) => { where.push(args.where); return []; };
    const prisma = {
      progress: { findMany: record },
      certificate: { findMany: record },
      assignment: { findMany: record },
    } as unknown as PrismaService;

    await new ReportsService(prisma).getSummary({ id: 'manager-1', organizationId, roles: ['manager'] });

    expect(where[0]).toMatchObject({ user: { groupMemberships: { some: { organizationId } } } });
    expect(where[1]).toMatchObject({ user: { groupMemberships: { some: { organizationId } } } });
    expect(where[2]).toMatchObject({ OR: expect.any(Array) });
  });
});
