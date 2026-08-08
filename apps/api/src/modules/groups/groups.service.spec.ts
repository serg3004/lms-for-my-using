import { PrismaService } from '../../database/prisma.service.js';
import { createGroupSchema, listGroupsQuerySchema } from './groups.schemas.js';
import { GroupsService } from './groups.service.js';

describe('listGroupsQuerySchema', () => {
  it('defaults to active when status is omitted', () => {
    expect(listGroupsQuerySchema.parse({})).toEqual({ status: 'active' });
  });

  it('accepts archived and deleted filters', () => {
    expect(listGroupsQuerySchema.parse({ status: 'archived' })).toEqual({ status: 'archived' });
    expect(listGroupsQuerySchema.parse({ status: 'deleted' })).toEqual({ status: 'deleted' });
  });

  it('rejects an unknown status value', () => {
    expect(() => listGroupsQuerySchema.parse({ status: 'suspended' })).toThrow();
  });
});

describe('GroupsService.listGroups', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';

  function buildService() {
    const findManyCalls: unknown[] = [];
    const prisma = {
      group: {
        findMany: async (args: unknown) => {
          findManyCalls.push(args);
          return [];
        },
      },
    } as unknown as PrismaService;

    return { service: new GroupsService(prisma), findManyCalls };
  }

  it('defaults to active, non-deleted groups', async () => {
    const { service, findManyCalls } = buildService();

    await service.listGroups(organizationId);

    expect(findManyCalls[0]).toMatchObject({
      where: { organizationId, deletedAt: null, status: 'active' },
    });
  });

  it('filters to archived groups when requested', async () => {
    const { service, findManyCalls } = buildService();

    await service.listGroups(organizationId, 'archived');

    expect(findManyCalls[0]).toMatchObject({
      where: { organizationId, deletedAt: null, status: 'archived' },
    });
  });

  it('filters to soft-deleted groups when requested, ignoring status', async () => {
    const { service, findManyCalls } = buildService();

    await service.listGroups(organizationId, 'deleted');

    expect(findManyCalls[0]).toMatchObject({
      where: { organizationId, deletedAt: { not: null } },
    });
  });
});

describe('Groups validation', () => {
  it('accepts valid group input', () => {
    const input = createGroupSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      name: 'Sales Team',
      slug: 'sales-team',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      name: 'Sales Team',
      slug: 'sales-team',
      status: 'active',
    });
  });

  it('rejects invalid group slug', () => {
    expect(() =>
      createGroupSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        name: 'Sales Team',
        slug: 'Sales Team',
      }),
    ).toThrow();
  });
});
