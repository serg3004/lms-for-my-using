/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { CurrentUser } from '../modules/auth/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 299 acceptance criteria, verified against real Postgres: the manager checklist analytics
// endpoint scopes employees through OrganizationAccessScopeService (not a bare Group-only filter),
// an admin sees the whole tenant, and the aggregation numbers hold up against persisted rows
// instead of mocks.
describe('manager checklist analytics (PR 299) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let reviewAccess: ChecklistReviewAccessService;
  let organizationId: string;
  let checklistId: string;
  let observerId: string;
  let managedEmployeeId: string;
  let unmanagedEmployeeId: string;
  let managerId: string;

  function currentUser(id: string, roles: CurrentUser['roles']): CurrentUser {
    return {
      id, organizationId, email: `${id}@example.test`, firstName: 'Test', lastName: 'User',
      middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC', roles,
    };
  }

  async function createSession(userId: string, opts: { scheduledAt: Date; percentage: number; passed: boolean; status?: 'completed' | 'in_progress'; scored?: boolean }) {
    const instance = await prisma.checklistInstance.create({
      data: {
        organizationId, checklistId, userId,
        status: opts.status ?? 'completed', percentage: opts.percentage, passed: opts.passed, scored: opts.scored ?? true,
        totalScore: opts.percentage, maxScore: 100,
      },
    });
    return prisma.checklistSession.create({
      data: { organizationId, instanceId: instance.id, observerId, status: 'completed', scheduledAt: opts.scheduledAt, timezone: 'UTC' },
    });
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    reviewAccess = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Mgr Analytics ${runId}`, slug: `mgr-analytics-${runId}` } });
    organizationId = organization.id;

    const observer = await prisma.user.create({ data: { organizationId, email: `observer-${runId}@example.test`, passwordHash: 'x', firstName: 'Obs', lastName: 'Erver' } });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const manager = await prisma.user.create({ data: { organizationId, email: `manager-${runId}@example.test`, passwordHash: 'x', firstName: 'Man', lastName: 'Ager' } });
    managerId = manager.id;
    await prisma.membership.create({ data: { organizationId, userId: managerId, role: 'manager' } });

    const managed = await prisma.user.create({ data: { organizationId, email: `managed-${runId}@example.test`, passwordHash: 'x', firstName: 'Managed', lastName: 'Employee' } });
    managedEmployeeId = managed.id;
    const unmanaged = await prisma.user.create({ data: { organizationId, email: `unmanaged-${runId}@example.test`, passwordHash: 'x', firstName: 'Unmanaged', lastName: 'Employee' } });
    unmanagedEmployeeId = unmanaged.id;

    const group = await prisma.group.create({ data: { organizationId, name: `Team ${runId}`, slug: `team-${runId}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: managedEmployeeId } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId } });

    const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Manager analytics checklist', status: 'published' } });
    checklistId = checklist.id;
  });

  afterEach(async () => {
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.managerGroup.deleteMany({ where: { organizationId } });
    await prisma.groupMember.deleteMany({ where: { organizationId } });
    await prisma.group.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  const query = { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' };
  const thresholds = { high: 90, low: 60 };

  it("scopes a manager's analytics to their own team via OrganizationAccessScopeService, excluding a sibling employee", async () => {
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10T00:00:00.000Z'), percentage: 80, passed: true });
    await createSession(unmanagedEmployeeId, { scheduledAt: new Date('2026-01-11T00:00:00.000Z'), percentage: 30, passed: false });

    const managerScope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, managerScope, thresholds);

    expect(result.summary.totalEmployees).toBe(1);
    expect(result.employees.map((row) => row.userId)).toEqual([managedEmployeeId]);
    expect(result.summary.averagePercentage).toBe(80);
  });

  it('gives an admin the whole tenant (unscoped)', async () => {
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10T00:00:00.000Z'), percentage: 80, passed: true });
    await createSession(unmanagedEmployeeId, { scheduledAt: new Date('2026-01-11T00:00:00.000Z'), percentage: 30, passed: false });

    const adminScope = await reviewAccess.participantLearnerScope(currentUser('admin-user', ['admin']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, adminScope, thresholds);

    expect(result.summary.totalEmployees).toBe(4); // observer, manager, managed, unmanaged all live in this org
    expect(result.employees.map((row) => row.userId).sort()).toEqual(
      [observerId, managerId, managedEmployeeId, unmanagedEmployeeId].sort(),
    );
  });

  it('excludes sessions scheduled outside the requested period from aggregation', async () => {
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10T00:00:00.000Z'), percentage: 80, passed: true });
    await createSession(managedEmployeeId, { scheduledAt: new Date('2025-12-01T00:00:00.000Z'), percentage: 10, passed: false });

    const managerScope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, managerScope, thresholds);

    expect(result.employees[0]).toMatchObject({ sessionsCount: 1, averagePercentage: 80 });
  });

  // PR 306 anomaly #15: no session at all was ever the untested path -- every other test in this
  // file creates at least one session before asserting. This proves the "no-data" claim in PR 299's
  // status paragraph ("каждый сотрудник в scope попадает в employees[], даже с нулём сессий за
  // период, что даёт честный noCompletionCount") against real Postgres, not just against the
  // in-memory aggregation logic: a managed employee with zero ChecklistSession rows in the whole
  // organization must still surface as an honest zero-row, not be silently dropped or crash the
  // aggregation on an empty result set.
  it('PR 306 #15: reports an honest zero-row for a managed employee with no sessions at all, not a dropped row or a crash', async () => {
    const managerScope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, managerScope, thresholds);

    expect(result.summary).toMatchObject({
      totalEmployees: 1,
      totalSessions: 0,
      completedSessions: 0,
      averagePercentage: 0,
      lowCount: 0,
      highCount: 0,
      noCompletionCount: 1,
    });
    expect(result.employees).toEqual([
      expect.objectContaining({
        userId: managedEmployeeId,
        sessionsCount: 0,
        completedCount: 0,
        averagePercentage: null,
        trend: null,
        lastSessionAt: null,
      }),
    ]);
    expect(result.distribution.every((bucket) => bucket.count === 0)).toBe(true);
    expect(result.trend).toEqual([]);
  });
});
