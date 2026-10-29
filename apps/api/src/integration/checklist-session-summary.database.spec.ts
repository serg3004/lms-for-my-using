/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { RolesGuard } from '../modules/auth/roles.guard.js';
import type { AuthenticatedRequest, CurrentUser } from '../modules/auth/public.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistWorkplaceSettingsService } from '../modules/checklists/checklist-workplace-settings.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('session summary export (PR 373) — database', () => {
  let prisma: PrismaService, controller: ChecklistsController, checklists: ChecklistsService;
  let organizationId: string, otherOrganizationId: string, checklistId: string;
  let admin: CurrentUser, manager: CurrentUser, instructor: CurrentUser, mentor: CurrentUser, employee: CurrentUser, outsider: CurrentUser;
  async function user(roles: CurrentUser['roles'], org = organizationId): Promise<CurrentUser> {
    const person = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.invalid`, passwordHash: 'unused', firstName: '=Synthetic', lastName: 'Employee', locale: 'ru' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: person.id, role })) });
    return { ...person, roles };
  }
  async function request(actor: CurrentUser) {
    const req = { currentUser: actor } as AuthenticatedRequest;
    const context = { getHandler: () => controller.exportSessionSummary, getClass: () => ChecklistsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context);
    return req;
  }
  async function observation(person = employee, day = 1, observer = instructor, sourceSheet = checklistId) {
    const org = person.organizationId;
    const instance = await checklists.assignChecklist(sourceSheet, org, { userId: person.id }, observer.id);
    const criteria = await prisma.checklistItem.findMany({ where: { checklistId: sourceSheet } });
    for (const item of criteria) await prisma.checklistItemResult.create({ data: { organizationId: org, instanceId: instance.id, itemId: item.id, checked: true, answerState: 'answered', points: item.points } });
    await prisma.checklistInstance.update({ where: { id: instance.id }, data: { status: 'completed', percentage: 100, totalScore: 3, maxScore: 3, passed: true, scored: true, completedAt: new Date(`2026-10-0${day}T11:00:00Z`) } });
    return prisma.checklistSession.create({ data: { organizationId: org, instanceId: instance.id, observerId: observer.id, status: 'completed', timezone: 'UTC', scheduledAt: new Date(`2026-10-0${day}T10:00:00Z`), startedAt: new Date(`2026-10-0${day}T10:05:00Z`), strengths: '@Feedback', developmentAreas: 'Keep practice', nextSteps: 'Comment' } });
  }
  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    checklists = new ChecklistsService(prisma, {} as UploadService);
    const access = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
    controller = new ChecklistsController(checklists, {} as UploadService, access, new ChecklistWorkplaceSettingsService(prisma), new ChecklistSessionService(prisma, checklists), undefined!);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    organizationId = (await prisma.organization.create({ data: { name: 'Summary', slug: `summary-${randomUUID()}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: 'Other', slug: `summary-other-${randomUUID()}` } })).id;
    admin = await user(['admin']); manager = await user(['manager']); instructor = await user(['instructor']); mentor = await user(['mentor']); employee = await user(['learner']); outsider = await user(['learner']);
    const group = await prisma.group.create({ data: { organizationId, name: 'Managed', slug: `managed-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: employee.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Summary sheet', status: 'published' } })).id;
    await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'Criterion', points: 3, isRequired: true } });
  });
  afterEach(async () => {
    for (const org of [organizationId, otherOrganizationId]) {
      const where = { organizationId: org };
      await prisma.checklistSessionEvent.deleteMany({ where }); await prisma.checklistSession.deleteMany({ where });
      await prisma.checklistItemResult.deleteMany({ where }); await prisma.checklistInstance.deleteMany({ where });
      await prisma.checklistItem.deleteMany({ where }); await prisma.checklist.deleteMany({ where });
      await prisma.managerGroup.deleteMany({ where }); await prisma.groupMember.deleteMany({ where }); await prisma.group.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where }); await prisma.checklistWorkplaceSettings.deleteMany({ where });
      await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where }); await prisma.organization.delete({ where: { id: org } });
    }
  });
  it('allows every report-reader role within its scope, localizes cells, neutralizes CSV and records exactly the authorized IDs', async () => {
    const item = await observation();
    for (const actor of [admin, manager, instructor, mentor, employee]) {
      const result = await controller.exportSessionSummary({ ids: item.id, format: 'csv' }, await request(actor));
      expect(result.csv).toContain('Отчёт Сводка по сессии');
      expect(result.csv).toContain(`"'=Synthetic Employee"`); expect(result.csv).toContain(`"'@Feedback"`);
      expect(result.csv).not.toContain('@example.invalid');
      expect(result.rows.some((row) => row[0] === 'Результаты сессии' && row[1] === '100%' && row[2] === '3 из 3')).toBe(true);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, actorId: actor.id, action: 'checklist_session.summary_exported' } });
      expect(audit.metadata).toMatchObject({ sessionIds: [item.id], format: 'csv', locale: 'ru' });
      expect(JSON.stringify(audit.metadata)).not.toContain('Feedback');
    }
  });
  it('rejects an outside-team ID even in a mixed selection, and never broadens the manager scope with an ID filter', async () => {
    const own = await observation(), outside = await observation(outsider);
    const audits = await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.summary_exported' } });
    for (const ids of [outside.id, `${own.id},${outside.id}`]) await expect(controller.exportSessionSummary({ ids }, await request(manager))).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.exportSessionSummary({ ids: outside.id }, await request(employee))).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.summary_exported' } })).toBe(audits);
  });
  it('preserves the assigned-observer exception for a manager outside the team and an employee observing someone else', async () => {
    for (const observer of [manager, employee]) {
      const item = await observation(outsider, 1, observer);
      await expect(controller.exportSessionSummary({ ids: item.id }, await request(observer))).resolves.toMatchObject({ sessionIds: [item.id] });
    }
  });
  it('keeps cross-tenant IDs hidden for all roles, including an administrator', async () => {
    const foreign = await user(['instructor'], otherOrganizationId), foreignLearner = await user(['learner'], otherOrganizationId);
    const sheet = (await prisma.checklist.create({ data: { organizationId: otherOrganizationId, title: 'Foreign sheet', status: 'published' } })).id;
    const outside = await observation(foreignLearner, 1, foreign, sheet), own = await observation();
    for (const actor of [admin, manager, instructor, mentor, employee]) await expect(controller.exportSessionSummary({ ids: `${own.id},${outside.id}` }, await request(actor))).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.summary_exported' } })).toBe(0);
  });
  it('sorts repeated observations, separates employees, and excludes deleted sessions/results', async () => {
    const later = await observation(employee, 3), earlier = await observation(employee, 1), different = await observation(outsider, 2);
    const result = await controller.exportSessionSummary({ ids: `${later.id},${different.id},${earlier.id}` }, await request(admin));
    expect(result.sessionIds).toEqual([earlier.id, different.id, later.id]);
    expect(result.rows.filter((row) => row[0] === 'Общий балл')).toHaveLength(2);
    await prisma.checklistInstance.update({ where: { id: earlier.instanceId }, data: { deletedAt: new Date(), resultDeleteReason: 'Test' } });
    await expect(controller.exportSessionSummary({ ids: earlier.id }, await request(admin))).rejects.toBeInstanceOf(NotFoundException);
    await prisma.checklistSession.update({ where: { id: later.id }, data: { deletedAt: new Date() } });
    await expect(controller.exportSessionSummary({ ids: later.id }, await request(admin))).rejects.toBeInstanceOf(NotFoundException);
  });
  it('does not export a learner result still hidden by feedbackVisibility or an unfinished session', async () => {
    const item = await observation();
    await prisma.checklistInstance.update({ where: { id: item.instanceId }, data: { status: 'submitted' } });
    await expect(controller.exportSessionSummary({ ids: item.id }, await request(employee))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.exportSessionSummary({ ids: item.id }, await request(instructor))).resolves.toBeDefined();
    await prisma.checklistSession.update({ where: { id: item.id }, data: { status: 'scheduled' } });
    await expect(controller.exportSessionSummary({ ids: item.id }, await request(admin))).rejects.toThrow('session_summary.completed_only');
  });
});
