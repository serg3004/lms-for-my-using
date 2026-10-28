/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../modules/auth/roles.guard.js';
import type { AuthenticatedRequest } from '../modules/auth/public.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistWorkplaceSettingsService } from '../modules/checklists/checklist-workplace-settings.service.js';

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

  // PR 334: department filter, breakdown and options must stay inside participantLearnerScope().
  it('PR 334: lists only departments of the manager zone, filters by department and rolls up per department', async () => {
    const [zoneDepartment, foreignDepartment] = await Promise.all([
      prisma.department.create({ data: { organizationId, name: 'Zone dept', code: `Z-${randomUUID()}` } }),
      prisma.department.create({ data: { organizationId, name: 'Foreign dept', code: `F-${randomUUID()}` } }),
    ]);
    await prisma.departmentMembership.create({ data: { organizationId, departmentId: zoneDepartment.id, userId: managedEmployeeId, isPrimary: true } });
    await prisma.departmentMembership.create({ data: { organizationId, departmentId: foreignDepartment.id, userId: unmanagedEmployeeId, isPrimary: true } });
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10T00:00:00.000Z'), percentage: 80, passed: true });
    await createSession(unmanagedEmployeeId, { scheduledAt: new Date('2026-01-11T00:00:00.000Z'), percentage: 30, passed: false });

    try {
      const managerScope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
      const result = await checklistsService.getManagerAnalytics(organizationId, query, managerScope, thresholds);
      expect(result.departmentOptions).toEqual([{ id: zoneDepartment.id, name: 'Zone dept' }]);
      expect(result.departments).toEqual([
        { departmentId: zoneDepartment.id, name: 'Zone dept', employeesCount: 1, sessionsCount: 1, completedCount: 1, averagePercentage: 80, noCompletionCount: 0 },
      ]);
      expect(result.employees[0]).toMatchObject({ userId: managedEmployeeId, departmentId: zoneDepartment.id, department: 'Zone dept' });

      // A department outside the zone yields an honest empty result, not the foreign employees.
      const foreign = await checklistsService.getManagerAnalytics(organizationId, { ...query, departmentId: foreignDepartment.id }, managerScope, thresholds);
      expect(foreign.employees).toEqual([]);
      expect(foreign.summary.totalEmployees).toBe(0);

      const adminScope = await reviewAccess.participantLearnerScope(currentUser('admin-user', ['admin']));
      const filtered = await checklistsService.getManagerAnalytics(organizationId, { ...query, departmentId: foreignDepartment.id }, adminScope, thresholds);
      expect(filtered.employees.map((row) => row.userId)).toEqual([unmanagedEmployeeId]);
      expect(filtered.departmentOptions.map((option) => option.name)).toEqual(['Foreign dept', 'Zone dept']);
    } finally {
      await prisma.departmentMembership.deleteMany({ where: { organizationId } });
      await prisma.department.deleteMany({ where: { organizationId } });
    }
  });

  it('PR 334: ignores soft-deleted sessions in the analytics', async () => {
    const session = await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10T00:00:00.000Z'), percentage: 80, passed: true });
    await prisma.checklistSession.update({ where: { id: session.id }, data: { deletedAt: new Date() } });

    const managerScope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, managerScope, thresholds);

    expect(result.summary.totalSessions).toBe(0);
  });
  async function reportUser(name: string, role: CurrentUser['roles'][number] = 'manager') {
    const row = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, passwordHash: 'unused', firstName: name, lastName: '' } });
    await prisma.membership.create({ data: { organizationId, userId: row.id, role } });
    return currentUser(row.id, [role]);
  }
  async function department(name: string, primaryManagerId?: string) {
    const row = await prisma.department.create({ data: { organizationId, name } });
    if (primaryManagerId) await prisma.departmentManager.create({ data: { organizationId, departmentId: row.id, userId: primaryManagerId, type: 'DIRECT', isPrimary: true } });
    return row;
  }
  async function primary(userId: string, departmentId: string) {
    return prisma.departmentMembership.create({ data: { organizationId, userId, departmentId, isPrimary: true } });
  }
  function controller() {
    return new ChecklistsController(checklistsService, {} as UploadService, reviewAccess, new ChecklistWorkplaceSettingsService(prisma), undefined!, undefined!);
  }
  async function request(actor: CurrentUser, handler: 'getManagerAnalytics' | 'exportManagerAnalytics') {
    const req = { currentUser: actor } as AuthenticatedRequest;
    const context = { getHandler: () => controller()[handler], getClass: () => ChecklistsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context);
    return req;
  }

  it('PR 356: uses both primary manager types, without historical memberships or duplicate transfers', async () => {
    const labelA = await reportUser('Primary A');
    const labelB = await reportUser('Primary B');
    const first = await department('First', labelA.id);
    const second = await department('Second', labelB.id);
    const membership = await primary(managedEmployeeId, first.id);
    await primary(unmanagedEmployeeId, second.id);
    // Non-primary and ended records are excluded; both current primary types are included.
    await prisma.departmentMembership.create({ data: { organizationId, userId: managedEmployeeId, departmentId: second.id, isPrimary: false } });
    await prisma.departmentMembership.create({ data: { organizationId, userId: managedEmployeeId, departmentId: second.id, isPrimary: true, effectiveTo: new Date('2025-01-01') } });
    await prisma.departmentManager.createMany({ data: [
      { organizationId, departmentId: first.id, userId: labelB.id, type: 'DIRECT', isPrimary: true, effectiveTo: new Date('2025-01-01') },
      { organizationId, departmentId: first.id, userId: labelB.id, type: 'DIRECT', isPrimary: false },
      { organizationId, departmentId: first.id, userId: labelB.id, type: 'FUNCTIONAL', isPrimary: true },
    ] });
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 80, passed: true });
    await createSession(unmanagedEmployeeId, { scheduledAt: new Date('2026-01-11'), percentage: 40, passed: false });
    const scope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const before = await checklistsService.getManagerAnalytics(organizationId, query, scope, thresholds);
    expect(before.managers).toEqual([{ managerId: labelA.id, name: 'Primary A', employeesCount: 1, completedCount: 1, averagePercentage: 80 }, { managerId: labelB.id, name: 'Primary B', employeesCount: 1, completedCount: 1, averagePercentage: 80 }]);
    expect(before.summary.totalEmployees).toBe(1);
    expect(before.managerOptions).toEqual([{ id: labelA.id, name: 'Primary A' }, { id: labelB.id, name: 'Primary B' }]);
    // Close both current memberships before moving the employee's primary department.
    await prisma.departmentMembership.update({ where: { id: membership.id }, data: { effectiveTo: new Date() } });
    await prisma.departmentMembership.updateMany({ where: { organizationId, userId: managedEmployeeId, departmentId: second.id, effectiveTo: null }, data: { effectiveTo: new Date() } });
    await primary(managedEmployeeId, second.id);
    const after = await checklistsService.getManagerAnalytics(organizationId, query, scope, thresholds);
    expect(after.managers).toEqual([{ managerId: labelB.id, name: 'Primary B', employeesCount: 1, completedCount: 1, averagePercentage: 80 }]);
    expect(after.managers.reduce((count, row) => count + row.employeesCount, 0)).toBe(1);
    expect((await checklistsService.getManagerAnalytics(organizationId, { ...query, managerId: labelA.id }, scope, thresholds)).managers).toEqual([]);
  });

  it('PR 356: counts finished sessions, averages only reviewed scored results and ignores deleted/out-of-period rows', async () => {
    const label = await reportUser('Leader');
    const dept = await department('Main', label.id);
    await primary(managedEmployeeId, dept.id);
    const scope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    for (const percentage of [80, 40]) await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage, passed: true });
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 0, passed: false, scored: false });
    const paused = await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 100, passed: true });
    await prisma.checklistSession.update({ where: { id: paused.id }, data: { status: 'paused' } });
    const deleted = await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 100, passed: true });
    await prisma.checklistSession.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const deletedInstance = await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 100, passed: true });
    await prisma.checklistInstance.update({ where: { id: deletedInstance.instanceId }, data: { deletedAt: new Date() } });
    await createSession(managedEmployeeId, { scheduledAt: new Date('2025-11-10'), percentage: 100, passed: true });
    expect((await checklistsService.getManagerAnalytics(organizationId, query, scope, thresholds)).managers).toEqual([
      { managerId: label.id, name: 'Leader', employeesCount: 1, completedCount: 3, averagePercentage: 60 },
    ]);
  });

  it('PR 356: missing/ended primary records form one unassigned bucket, with no invented zero average', async () => {
    const old = await department('Old');
    const ended = await department('Ended');
    await primary(managedEmployeeId, ended.id);
    await prisma.departmentMembership.create({ data: { organizationId, userId: managedEmployeeId, departmentId: old.id, isPrimary: true, effectiveTo: new Date('2025-01-01') } });
    await prisma.departmentManager.create({ data: { organizationId, departmentId: ended.id, userId: observerId, type: 'DIRECT', isPrimary: true, effectiveTo: new Date('2025-01-01') } });
    const result = await checklistsService.getManagerAnalytics(organizationId, query, {}, thresholds);
    expect(result.managers).toEqual([{ managerId: null, name: null, employeesCount: 4, completedCount: 0, averagePercentage: null }]);
    expect(result.managerOptions).toEqual([]);
    const unassigned = await checklistsService.getManagerAnalytics(organizationId, { ...query, managerId: 'unassigned' }, {}, thresholds);
    expect(unassigned.employees).toHaveLength(4);
  });

  it('PR 356: role guard, tenant scope, filters and CSV/XLSX rows agree with the manager table', async () => {
    const api = controller();
    const actor = currentUser(managerId, ['manager']);
    const label = await reportUser('=Leader,"One"');
    const hiddenLabel = await reportUser('Private manager');
    const dept = await department('Visible', label.id);
    const hiddenDept = await department('Private', hiddenLabel.id);
    await primary(managedEmployeeId, dept.id); await primary(unmanagedEmployeeId, hiddenDept.id);
    await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 80, passed: true });
    await createSession(unmanagedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage: 10, passed: false });
    const screen = await api.getManagerAnalytics(query, await request(actor, 'getManagerAnalytics'));
    expect(screen.managerOptions).toEqual([{ id: label.id, name: '=Leader,"One"' }]);
    for (const format of ['csv', 'xlsx'] as const) {
      const file = await api.exportManagerAnalytics({ ...query, table: 'managers', format }, await request(actor, 'exportManagerAnalytics'));
      expect(file.rowCount).toBe(screen.managers.length);
      expect(file.rows.slice(1)).toEqual(screen.managers.map((row) => [row.name, row.employeesCount, row.completedCount, row.averagePercentage]));
      expect(file.csv).toContain(`"'=Leader,""One"""`);
      expect(file.csv).not.toContain('Private manager');
      expect(file.csv).not.toContain(managedEmployeeId);
      expect(await prisma.auditLog.findFirst({ where: { organizationId, action: 'checklist_report.exported' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ metadata: { kind: 'manager_managers', format, rowCount: 1 } });
    }
    const otherTenant = await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}` } });
    try {
      const foreign = await prisma.user.create({ data: { organizationId: otherTenant.id, email: `${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Foreign manager', lastName: '' } });
      for (const id of [hiddenLabel.id, foreign.id, randomUUID()]) {
        const result = await api.getManagerAnalytics({ ...query, managerId: id }, await request(actor, 'getManagerAnalytics'));
        expect(result.managers).toEqual([]); expect(result.employees).toEqual([]);
        expect(JSON.stringify(result)).not.toContain('Foreign manager');
        const file = await api.exportManagerAnalytics({ ...query, managerId: id, table: 'managers' }, await request(actor, 'exportManagerAnalytics'));
        expect(file.rowCount).toBe(0);
      }
    } finally { await prisma.user.deleteMany({ where: { organizationId: otherTenant.id } }); await prisma.organization.delete({ where: { id: otherTenant.id } }); }
    const admin = await reportUser('Admin', 'admin');
    const all = await api.getManagerAnalytics(query, await request(admin, 'getManagerAnalytics'));
    expect(all.managers.map((row) => row.managerId)).toEqual(expect.arrayContaining([label.id, hiddenLabel.id, null]));
    const selected = await api.getManagerAnalytics({ ...query, managerId: hiddenLabel.id, departmentId: hiddenDept.id }, await request(admin, 'getManagerAnalytics'));
    expect(selected.employees.map((row) => row.userId)).toEqual([unmanagedEmployeeId]);
    expect(selected.managers).toEqual([{ managerId: hiddenLabel.id, name: 'Private manager', employeesCount: 1, completedCount: 1, averagePercentage: 10 }]);
    for (const role of ['instructor', 'mentor', 'learner'] as const) {
      const denied = await reportUser(role, role);
      for (const handler of ['getManagerAnalytics', 'exportManagerAnalytics'] as const) await expect(request(denied, handler)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('PR 356: one person holding both primary types counts each employee and session once', async () => {
    const label = await reportUser('Same person');
    const dept = await department('Main', label.id);
    await prisma.departmentManager.create({ data: { organizationId, departmentId: dept.id, userId: label.id, type: 'FUNCTIONAL', isPrimary: true } });
    await primary(managedEmployeeId, dept.id);
    const second = await reportUser('Second employee', 'learner');
    const group = await prisma.managerGroup.findFirstOrThrow({ where: { organizationId, managerId } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.groupId, userId: second.id } });
    await primary(second.id, dept.id);
    for (const percentage of [80, 40]) await createSession(managedEmployeeId, { scheduledAt: new Date('2026-01-10'), percentage, passed: true });
    await createSession(second.id, { scheduledAt: new Date('2026-01-10'), percentage: 100, passed: true });
    const scope = await reviewAccess.participantLearnerScope(currentUser(managerId, ['manager']));
    const result = await checklistsService.getManagerAnalytics(organizationId, query, scope, thresholds);
    expect(result.managers).toEqual([{ managerId: label.id, name: 'Same person', employeesCount: 2, completedCount: 3, averagePercentage: 73 }]);
    expect(result.summary.totalEmployees).toBe(2);
    const filtered = await checklistsService.getManagerAnalytics(organizationId, { ...query, managerId: label.id }, scope, thresholds);
    expect(filtered.managers).toEqual(result.managers);
    expect(filtered.employees).toHaveLength(2);
  });

});
