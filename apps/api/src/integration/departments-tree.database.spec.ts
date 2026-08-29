/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { MAX_DEPARTMENT_DEPTH } from '../modules/departments/departments.schemas.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the real PostgreSQL recursive CTEs (department-tree-queries.ts) and real
 * Serializable-transaction concurrency behavior that a mocked-Prisma unit test cannot
 * meaningfully cover. See departments.service.spec.ts for the exhaustive branch-level
 * coverage of validation/rejection logic against a mocked client.
 */
describe('departments tree API (database)', () => {
  const prisma = new PrismaClient();
  const service = new DepartmentsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentType.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Departments tree ${suffix}`, slug: `departments-tree-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  it('builds a 3+ level tree and resolves roots, children, and ancestor path', async () => {
    const organization = await createOrganization();

    const root = await service.createDepartment(
      { organizationId: organization.id, name: 'Company', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
    const division = await service.createDepartment(
      {
        organizationId: organization.id,
        parentId: root.id,
        name: 'Engineering',
        sortOrder: 0,
        directManagerMode: 'LOCAL',
        functionalManagerMode: 'LOCAL',
      },
      null,
    );
    const team = await service.createDepartment(
      {
        organizationId: organization.id,
        parentId: division.id,
        name: 'Platform team',
        sortOrder: 0,
        directManagerMode: 'LOCAL',
        functionalManagerMode: 'LOCAL',
      },
      null,
    );

    const roots = await service.getTree(organization.id);
    expect(roots.map((d) => d.id)).toEqual([root.id]);

    const rootChildren = await service.getChildren(root.id, organization.id);
    expect(rootChildren.map((d) => d.id)).toEqual([division.id]);

    const path = await service.getPath(team.id, organization.id);
    expect(path.map((d) => d.id)).toEqual([root.id, division.id, team.id]);
  });

  it('rejects creating a department deeper than the maximum depth', async () => {
    const organization = await createOrganization();

    let parentId: string | undefined;
    for (let level = 0; level < MAX_DEPARTMENT_DEPTH; level += 1) {
      const created = await service.createDepartment(
        {
          organizationId: organization.id,
          parentId,
          name: `Level ${level}`,
          sortOrder: 0,
          directManagerMode: 'LOCAL',
          functionalManagerMode: 'LOCAL',
        },
        null,
      );
      parentId = created.id;
    }

    await expect(
      service.createDepartment(
        {
          organizationId: organization.id,
          parentId,
          name: 'One level too deep',
          sortOrder: 0,
          directManagerMode: 'LOCAL',
          functionalManagerMode: 'LOCAL',
        },
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
  }, 30_000);

  it('rejects moving a department under its own descendant', async () => {
    const organization = await createOrganization();
    const grandparent = await service.createDepartment(
      { organizationId: organization.id, name: 'Grandparent', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
    const parent = await service.createDepartment(
      {
        organizationId: organization.id,
        parentId: grandparent.id,
        name: 'Parent',
        sortOrder: 0,
        directManagerMode: 'LOCAL',
        functionalManagerMode: 'LOCAL',
      },
      null,
    );

    await expect(service.moveDepartment(grandparent.id, organization.id, { parentId: parent.id }, null)).rejects.toMatchObject({
      status: 409,
    });

    const reloaded = await prisma.department.findUniqueOrThrow({ where: { id: grandparent.id } });
    expect(reloaded.parentId).toBeNull();
  });

  it('never lets two concurrent opposite moves create a two-node cycle', async () => {
    const organization = await createOrganization();
    const a = await service.createDepartment(
      { organizationId: organization.id, name: 'A', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
    const b = await service.createDepartment(
      { organizationId: organization.id, name: 'B', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );

    const results = await Promise.allSettled([
      service.moveDepartment(a.id, organization.id, { parentId: b.id }, null),
      service.moveDepartment(b.id, organization.id, { parentId: a.id }, null),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [reloadedA, reloadedB] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.department.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    const parentsById = new Map([
      [a.id, reloadedA.parentId],
      [b.id, reloadedB.parentId],
    ]);
    // A cycle would mean each is reachable from the other by following parentId.
    const noCycle =
      (parentsById.get(a.id) === null && parentsById.get(b.id) === a.id) ||
      (parentsById.get(b.id) === null && parentsById.get(a.id) === b.id) ||
      (parentsById.get(a.id) === null && parentsById.get(b.id) === null);
    expect(noCycle).toBe(true);
  }, 30_000);
});
