/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { expireDueChecklistBatch } from '../modules/checklists/checklist-deadlines.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('checklist deadline lifecycle — database', () => {
  let prisma: PrismaService;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
      await prisma.checklistInstance.deleteMany({ where: { organizationId } });
      await prisma.checklistItem.deleteMany({ where: { organizationId } });
      await prisma.checklist.deleteMany({ where: { organizationId } });
      await prisma.membership.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });

  async function createTenant(label: string) {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Deadline ${label} ${runId}`, slug: `deadline-${label}-${runId}` },
    });
    organizationIds.push(organization.id);

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: `${label}-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Deadline',
        lastName: label,
      },
    });

    const checklist = await prisma.checklist.create({
      data: {
        organizationId: organization.id,
        title: `Deadline ${label}`,
        status: 'published',
        createdBy: user.id,
      },
    });

    return { organizationId: organization.id, userId: user.id, checklistId: checklist.id };
  }

  it('expires only active overdue rows across tenants, preserves terminal/open rows, and is idempotent', async () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const tenantA = await createTenant('a');
    const tenantB = await createTenant('b');

    const rows = await Promise.all([
      prisma.checklistInstance.create({
        data: { ...tenantA, assignedBy: tenantA.userId, status: 'assigned', dueAt: new Date('2026-08-23T11:00:00.000Z') },
      }),
      prisma.checklistInstance.create({
        data: { ...tenantA, assignedBy: tenantA.userId, status: 'in_progress', dueAt: now },
      }),
      prisma.checklistInstance.create({
        data: { ...tenantA, assignedBy: tenantA.userId, status: 'assigned', dueAt: new Date('2026-08-23T13:00:00.000Z') },
      }),
      prisma.checklistInstance.create({
        data: { ...tenantA, assignedBy: tenantA.userId, status: 'assigned', dueAt: null },
      }),
      prisma.checklistInstance.create({
        data: {
          ...tenantA,
          assignedBy: tenantA.userId,
          status: 'submitted',
          submittedAt: new Date('2026-08-23T11:30:00.000Z'),
          dueAt: new Date('2026-08-23T11:00:00.000Z'),
        },
      }),
      prisma.checklistInstance.create({
        data: {
          ...tenantA,
          assignedBy: tenantA.userId,
          status: 'completed',
          completedAt: new Date('2026-08-23T11:30:00.000Z'),
          dueAt: new Date('2026-08-23T11:00:00.000Z'),
        },
      }),
      prisma.checklistInstance.create({
        data: { ...tenantB, assignedBy: tenantB.userId, status: 'assigned', dueAt: new Date('2026-08-23T10:00:00.000Z') },
      }),
    ]);

    await expect(expireDueChecklistBatch(prisma, now, 2)).resolves.toEqual({ selected: 2, expired: 2 });
    await expect(expireDueChecklistBatch(prisma, now, 2)).resolves.toEqual({ selected: 1, expired: 1 });
    await expect(expireDueChecklistBatch(prisma, now, 2)).resolves.toEqual({ selected: 0, expired: 0 });

    const stored = await prisma.checklistInstance.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: { id: true, status: true, organizationId: true },
    });
    const byId = new Map(stored.map((row) => [row.id, row]));
    expect(rows.map((row) => byId.get(row.id)?.status)).toEqual([
      'expired',
      'expired',
      'assigned',
      'assigned',
      'submitted',
      'completed',
      'expired',
    ]);
    expect([byId.get(rows[0].id)?.organizationId, byId.get(rows[6].id)?.organizationId]).toEqual([
      tenantA.organizationId,
      tenantB.organizationId,
    ]);
  });

  it('installs the overdue-query index used by the expiration worker', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'checklist_instances'
    `;

    expect(indexes.map((index) => index.indexname)).toContain('checklist_instances_status_due_at_organization_id_idx');
  });
});
