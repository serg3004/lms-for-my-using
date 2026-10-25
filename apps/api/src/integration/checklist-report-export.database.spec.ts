/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../database/prisma.service.js';
import { RolesGuard } from '../modules/auth/roles.guard.js';
import type { AuthenticatedRequest, CurrentUser } from '../modules/auth/public.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 336: CSV exports go through the real role guard, the unified scope services and the audit log.
describe('checklist report CSV export (PR 336) — database', () => {
  let prisma: PrismaService;
  let controller: ChecklistsController;
  let checklists: ChecklistsService;
  let sessions: ChecklistSessionService;
  let access: ChecklistReviewAccessService;
  let organizationId: string;
  let admin: CurrentUser;
  let manager: CurrentUser;
  let instructor: CurrentUser;
  let learner: CurrentUser;
  let managed: CurrentUser;
  let outsider: CurrentUser;
  let checklistId: string;

  async function user(roles: CurrentUser['roles'], names: { firstName: string; lastName: string } = { firstName: 'Test', lastName: 'User' }): Promise<CurrentUser> {
    const created = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, passwordHash: 'unused', ...names } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId, userId: created.id, role })) });
    return { ...created, roles };
  }
  async function request(actor: CurrentUser, handler: keyof ChecklistsController): Promise<AuthenticatedRequest> {
    const req = { currentUser: actor } as AuthenticatedRequest;
    const context = {
      getHandler: () => controller[handler], getClass: () => ChecklistsController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context);
    return req;
  }
  async function session(userId: string) {
    const instance = await prisma.checklistInstance.create({ data: { organizationId, checklistId, userId, status: 'completed', percentage: 80, passed: true, scored: true } });
    return prisma.checklistSession.create({
      data: {
        organizationId, instanceId: instance.id, observerId: instructor.id, status: 'completed', timezone: 'UTC',
        scheduledAt: new Date('2026-01-10T00:00:00.000Z'), strengths: 'Secret feedback', developmentAreas: 'Secret growth area',
      },
    });
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    checklists = new ChecklistsService(prisma, {} as UploadService);
    access = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
    sessions = new ChecklistSessionService(prisma, checklists);
    controller = new ChecklistsController(checklists, {} as UploadService, access, undefined!, sessions, undefined!);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: 'Export', slug: `export-${randomUUID()}` } });
    organizationId = org.id;
    admin = await user(['admin']);
    manager = await user(['manager']);
    instructor = await user(['instructor']);
    learner = await user(['learner']);
    managed = await user(['learner'], { firstName: '=Managed', lastName: 'Employee' });
    outsider = await user(['learner'], { firstName: 'Outsider', lastName: 'Employee' });
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: managed.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Opening shift', status: 'published' } })).id;
  });
  afterEach(async () => {
    const where = { organizationId };
    await prisma.checklistSessionEvent.deleteMany({ where });
    await prisma.checklistSession.deleteMany({ where });
    await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklist.deleteMany({ where });
    await prisma.managerGroup.deleteMany({ where });
    await prisma.groupMember.deleteMany({ where });
    await prisma.group.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('exports only the manager zone, neutralises formulas, omits feedback and writes an audit entry', async () => {
    await session(managed.id);
    await session(outsider.id);

    const result = await controller.exportSessions({}, await request(manager, 'exportSessions'));

    expect(result.rowCount).toBe(1);
    expect(result.filename).toMatch(/^checklist-sessions-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csv).toContain(`"'=Managed Employee"`);
    expect(result.csv).not.toContain('Outsider');
    expect(result.csv).not.toContain('Secret');
    expect(result.csv).not.toMatch(/null|undefined/);
    expect(await prisma.auditLog.findFirst({ where: { organizationId, action: 'checklist_report.exported', actorId: manager.id } }))
      .toMatchObject({ metadata: expect.objectContaining({ kind: 'sessions', rowCount: 1 }) });
  });

  it('gives an admin the whole tenant and honours the same filters as the list', async () => {
    await session(managed.id);
    await session(outsider.id);

    const all = await controller.exportSessions({}, await request(admin, 'exportSessions'));
    const searched = await controller.exportSessions({ search: 'Outsider' }, await request(admin, 'exportSessions'));

    expect(all.rowCount).toBe(2);
    expect(searched.rowCount).toBe(1);
    expect(searched.csv).toContain('Outsider Employee');
    const list = await sessions.list(organizationId, { page: 1, pageSize: 25, sort: 'scheduled', search: 'Outsider' }, await access.sessionScope(admin), { isLearnerOnly: false, feedbackVisibility: 'live' });
    expect(list.total).toBe(searched.rowCount);
  });

  it('refuses both exports to learners and instructors, and a missing audit never leaks rows', async () => {
    await expect(request(learner, 'exportSessions')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request(instructor, 'exportSessions')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request(learner, 'exportManagerAnalytics')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request(instructor, 'exportManagerAnalytics')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_report.exported' } })).toBe(0);
  });

  it('exports the dashboard employees of the manager zone with the dashboard view and audits it', async () => {
    await session(managed.id);
    await session(outsider.id);
    const scope = await access.participantLearnerScope(manager);
    const query = { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' };
    const thresholds = { high: 90, low: 60 };

    const all = await checklists.exportManagerAnalytics(organizationId, query, scope, thresholds, { id: manager.id, locale: 'en' });
    expect(all.rowCount).toBe(1);
    expect(all.csv).toContain(`"'=Managed Employee"`);
    expect(all.csv).not.toContain('Outsider');
    expect(all.csv).not.toContain('@example.test');

    const noMatch = await checklists.exportManagerAnalytics(organizationId, { ...query, q: 'nobody' }, scope, thresholds, { id: manager.id, locale: 'ru' });
    expect(noMatch.rowCount).toBe(0);
    expect(noMatch.csv).toContain('Сотрудник');

    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_report.exported', actorId: manager.id } })).toBe(2);
  });
});
