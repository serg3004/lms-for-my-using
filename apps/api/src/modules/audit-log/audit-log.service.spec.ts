import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from './audit-log.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';

type Call = { resource: string; method: string; args: Record<string, unknown> };

function createPrismaSpy(overrides: {
  auditLogFindMany?: unknown[];
  auditLogCount?: number;
  userFindMany?: unknown[];
} = {}) {
  const calls: Call[] = [];
  const record = (resource: string, method: string, result: unknown) => async (args: Record<string, unknown>) => {
    calls.push({ resource, method, args });
    return result;
  };

  const prisma = {
    auditLog: {
      create: record('auditLog', 'create', { id: 'log-1' }),
      findMany: record('auditLog', 'findMany', overrides.auditLogFindMany ?? []),
      count: record('auditLog', 'count', overrides.auditLogCount ?? 0),
    },
    user: {
      findMany: record('user', 'findMany', overrides.userFindMany ?? []),
    },
  } as unknown as PrismaService;

  return { prisma, calls };
}

describe('AuditLogService', () => {
  describe('record', () => {
    it('writes an entry with the given fields', async () => {
      const { prisma, calls } = createPrismaSpy();
      const service = new AuditLogService(prisma);

      await service.record({
        organizationId,
        actorId: 'user-1',
        action: 'course.created',
        targetType: 'course',
        targetId: 'course-1',
        summary: 'Created course Foo',
        metadata: { fields: ['title'] },
      });

      expect(calls).toEqual([{
        resource: 'auditLog',
        method: 'create',
        args: {
          data: {
            organizationId,
            actorId: 'user-1',
            action: 'course.created',
            targetType: 'course',
            targetId: 'course-1',
            summary: 'Created course Foo',
            metadata: { fields: ['title'] },
          },
        },
      }]);
    });

    it('never throws when the write fails — a logging failure must not fail the mutation it describes', async () => {
      const prisma = {
        auditLog: {
          create: async () => { throw new Error('db unavailable'); },
        },
      } as unknown as PrismaService;
      const service = new AuditLogService(prisma);

      await expect(service.record({
        organizationId,
        actorId: null,
        action: 'course.created',
        targetType: 'course',
        summary: 'Created course Foo',
      })).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('paginates and resolves actor summaries for the returned entries', async () => {
      const { prisma, calls } = createPrismaSpy({
        auditLogFindMany: [
          { id: 'log-1', organizationId, actorId: 'user-1', action: 'course.created', targetType: 'course', targetId: 'course-1', summary: 'Created course Foo', metadata: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
          { id: 'log-2', organizationId, actorId: null, action: 'course.updated', targetType: 'course', targetId: 'course-1', summary: 'Updated course Foo', metadata: null, createdAt: new Date('2026-01-02T00:00:00.000Z') },
        ],
        auditLogCount: 2,
        userFindMany: [{ id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }],
      });
      const service = new AuditLogService(prisma);

      const result = await service.list(organizationId, { page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.items[0].actor).toEqual({ id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
      expect(result.items[1].actor).toBeNull();
      expect(calls.find((c) => c.resource === 'user' && c.method === 'findMany')?.args).toEqual({
        where: { id: { in: ['user-1'] }, organizationId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
    });

    it('scopes the query to the given organization and applies filters', async () => {
      const { prisma, calls } = createPrismaSpy();
      const service = new AuditLogService(prisma);

      await service.list(organizationId, { page: 2, pageSize: 10, action: 'course.created', targetType: 'course', actorId: 'user-1' });

      const findManyCall = calls.find((c) => c.resource === 'auditLog' && c.method === 'findMany');
      expect(findManyCall?.args).toMatchObject({
        where: { organizationId, action: 'course.created', targetType: 'course', actorId: 'user-1' },
        skip: 10,
        take: 10,
      });
    });

    it('does not query users when no entries have an actor', async () => {
      const { prisma, calls } = createPrismaSpy({
        auditLogFindMany: [{ id: 'log-1', organizationId, actorId: null, action: 'organization.theme_reset', targetType: 'organization', targetId: organizationId, summary: 'Reset theme', metadata: null, createdAt: new Date() }],
        auditLogCount: 1,
      });
      const service = new AuditLogService(prisma);

      await service.list(organizationId, { page: 1, pageSize: 20 });

      expect(calls.some((c) => c.resource === 'user')).toBe(false);
    });
  });
});
