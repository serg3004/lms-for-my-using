/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ReportsService } from '../modules/reports/reports.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

const REPORTS_LIST_LIMIT = 100;

describe('ReportsService.getSummary — database, large dataset', () => {
  let prisma: PrismaService;
  let reports: ReportsService;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    reports = new ReportsService(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.certificate.deleteMany({ where: { organizationId } });
      await prisma.assignment.deleteMany({ where: { organizationId } });
      await prisma.progress.deleteMany({ where: { organizationId } });
      await prisma.course.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });

  it('bounds every returned list while database-side counts stay correct across the full dataset', async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Reports scale ${runId}`, slug: `reports-scale-${runId}` },
    });
    organizationIds.push(organization.id);

    const admin = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: `admin-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Admin',
        lastName: 'Reports',
      },
    });

    const course = await prisma.course.create({
      data: { organizationId: organization.id, title: `Reports scale course ${runId}`, slug: `reports-scale-course-${runId}` },
    });

    // 150 rows per resource — well above REPORTS_LIST_LIMIT (100) — each tied to a
    // distinct user to satisfy the (courseId, lessonId, userId) / (organizationId,
    // courseId, userId) unique constraints on Progress/Certificate.
    const rowCount = 150;
    const completedCount = 100;
    const issuedCount = 120;
    const users = await Promise.all(
      Array.from({ length: rowCount }, (_, index) =>
        prisma.user.create({
          data: {
            organizationId: organization.id,
            email: `learner-${runId}-${index}@example.test`,
            passwordHash: 'not-used-by-this-test',
            firstName: 'Learner',
            lastName: `${index}`,
          },
        }),
      ),
    );

    await Promise.all(
      users.map((user, index) =>
        prisma.progress.create({
          data: {
            organizationId: organization.id,
            courseId: course.id,
            userId: user.id,
            status: index < completedCount ? 'completed' : 'in_progress',
            score: index < completedCount ? index + 1 : null,
          },
        }),
      ),
    );

    await Promise.all(
      users.map((user, index) =>
        prisma.certificate.create({
          data: {
            organizationId: organization.id,
            courseId: course.id,
            userId: user.id,
            status: index < issuedCount ? 'issued' : 'revoked',
          },
        }),
      ),
    );

    const now = Date.now();
    await Promise.all(
      users.map((user, index) =>
        prisma.assignment.create({
          data: {
            organizationId: organization.id,
            courseId: course.id,
            userId: user.id,
            status: 'assigned',
            dueAt: new Date(now - (index + 1) * 60_000),
          },
        }),
      ),
    );

    const result = await reports.getSummary({ id: admin.id, organizationId: organization.id, roles: ['admin'] });

    expect(result.progress).toHaveLength(REPORTS_LIST_LIMIT);
    expect(result.certificates).toHaveLength(REPORTS_LIST_LIMIT);
    expect(result.overdueAssignments).toHaveLength(REPORTS_LIST_LIMIT);

    // The whole point of this PR: counts reflect the full 150-row dataset, not just
    // the bounded 100-row slice returned above.
    expect(result.counts.progressTotal).toBe(rowCount);
    expect(result.counts.progressCompletedTotal).toBe(completedCount);
    // Scores 1..100 (1-indexed): average = (1 + 100) / 2 = 50.5.
    expect(result.counts.progressAvgScore).toBeCloseTo(50.5, 5);
    expect(result.counts.certificatesIssuedTotal).toBe(issuedCount);
    expect(result.counts.overdueTotal).toBe(rowCount);
  }, 60_000);
});
