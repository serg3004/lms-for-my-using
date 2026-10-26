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
import { notifySessionChange, CHECKLIST_SESSION_CHANGE_NOTIFY_JOB } from '../modules/checklists/checklist-session-notifications.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('session change notifications (PR 345) — database', () => {
  let prisma: PrismaService;
  let sessions: ChecklistSessionService;
  let access: ChecklistReviewAccessService;
  let controller: ChecklistsController;
  let checklists: ChecklistsService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let admin: CurrentUser;
  let observer: CurrentUser;
  let replacement: CurrentUser;
  let learner: CurrentUser;
  let second: CurrentUser;
  let foreignAdmin: CurrentUser;
  let checklistId: string;
  async function user(org: string, roles: CurrentUser['roles']): Promise<CurrentUser> {
    const row = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, firstName: 'Private', lastName: 'Person', passwordHash: 'unused' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: row.id, role })) });
    return { ...row, roles };
  }
  async function request(actor: CurrentUser, handler: keyof ChecklistsController) {
    const req = { currentUser: actor } as AuthenticatedRequest;
    await new RolesGuard(prisma, new Reflector()).canActivate({ getHandler: () => controller[handler], getClass: () => ChecklistsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext);
    return req;
  }
  async function assignment(userId = learner.id) {
    return checklists.assignChecklist(checklistId, organizationId, { userId }, admin.id);
  }
  async function create() {
    const instance = await assignment();
    return sessions.create(organizationId, { instanceId: instance.id, observerId: observer.id }, admin.id);
  }
  function notices(type: string) { return prisma.notification.findMany({ where: { organizationId, type }, orderBy: { userId: 'asc' } }); }
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
    organizationId = (await prisma.organization.create({ data: { name: 'Notifications', slug: `notifications-${randomUUID()}` } })).id;
    foreignOrganizationId = (await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}` } })).id;
    admin = await user(organizationId, ['admin']); observer = await user(organizationId, ['instructor']); replacement = await user(organizationId, ['instructor']);
    learner = await user(organizationId, ['learner']); second = await user(organizationId, ['learner']); foreignAdmin = await user(foreignOrganizationId, ['admin']);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Secret title other-person@example.invalid', status: 'published' } })).id;
  });
  afterEach(async () => {
    const where = { organizationId: { in: [organizationId, foreignOrganizationId] } };
    for (const org of [organizationId, foreignOrganizationId]) await prisma.outboxEvent.deleteMany({ where: { topic: CHECKLIST_SESSION_CHANGE_NOTIFY_JOB, payload: { path: ['organizationId'], equals: org } } });
    await prisma.notification.deleteMany({ where }); await prisma.checklistIdempotencyKey.deleteMany({ where });
    await prisma.checklistSessionReminder.deleteMany({ where }); await prisma.checklistSessionEvent.deleteMany({ where });
    await prisma.checklistSession.deleteMany({ where }); await prisma.checklistInstance.deleteMany({ where });
    await prisma.managerGroup.deleteMany({ where }); await prisma.groupMember.deleteMany({ where }); await prisma.group.deleteMany({ where });
    await prisma.checklist.deleteMany({ where }); await prisma.auditLog.deleteMany({ where });
    await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, foreignOrganizationId] } } });
  });

  it('creates exactly one notice/outbox per participant for concurrent keyed creation and replay', async () => {
    const instance = await assignment(); const key = randomUUID();
    const input = { instanceId: instance.id, observerId: observer.id, idempotencyKey: key };
    const created = await Promise.all([1, 2].map(() => sessions.create(organizationId, input, admin.id)));
    expect(created[0].id).toBe(created[1].id);
    await sessions.create(organizationId, input, admin.id);
    const rows = await notices('checklist_session_scheduled');
    expect(rows.map((row) => row.userId).sort()).toEqual([learner.id, observer.id].sort());
    expect(rows.every((row) => JSON.stringify(row.data) === JSON.stringify({ sessionId: created[0].id }))).toBe(true);
    const outbox = await prisma.outboxEvent.findMany({ where: { topic: CHECKLIST_SESSION_CHANGE_NOTIFY_JOB, payload: { path: ['organizationId'], equals: organizationId } } });
    expect(outbox).toHaveLength(2);
    expect(JSON.stringify({ rows, outbox })).not.toMatch(/Secret|@|latitude|longitude|strengths|percentage/);
  });
  it('batches the common observer once and does not notify skipped/failed learners or a repeated batch', async () => {
    const input = { checklistId, learnerIds: [learner.id, second.id], observerId: observer.id };
    expect((await sessions.bulkCreate(organizationId, input, admin.id, {})).created).toBe(2);
    const rows = await notices('checklist_session_scheduled');
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.userId)).size).toBe(3);
    expect(rows.find((row) => row.userId === observer.id)?.link).toBe('/instructor/checklists/sessions');
    expect((await sessions.bulkCreate(organizationId, input, admin.id, {})).skipped).toBe(2);
    expect(await notices('checklist_session_scheduled')).toHaveLength(3);
  });
  it('notifies learner, new and previous observer once; stale writes and unchanged schedules do not duplicate', async () => {
    const created = await create();
    const input = { version: created.version, observerId: replacement.id, scheduledAt: '2026-11-01T12:00:00.000Z' };
    const updated = await sessions.update(created.id, organizationId, input, admin.id, {});
    expect((await notices('checklist_session_rescheduled')).map((row) => row.userId).sort()).toEqual([learner.id, observer.id, replacement.id].sort());
    expect((await notices('checklist_session_rescheduled')).find((row) => row.userId === observer.id)?.link).toBe('/instructor/checklists/sessions');
    await expect(sessions.update(created.id, organizationId, input, admin.id, {})).rejects.toThrow();
    await sessions.update(created.id, organizationId, { version: updated.version, scheduledAt: input.scheduledAt }, admin.id, {});
    expect(await notices('checklist_session_rescheduled')).toHaveLength(3);
  });
  it('records one set of participant notices for two racing reschedules', async () => {
    const created = await create();
    const input = { version: 1, observerId: replacement.id, scheduledAt: '2026-11-02T12:00:00.000Z' };
    const results = await Promise.allSettled([1, 2].map(() => sessions.update(created.id, organizationId, input, admin.id, {})));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await notices('checklist_session_rescheduled')).toHaveLength(3);
  });

  it('notifies both participants once when deleted and uses list links', async () => {
    const created = await create();
    await sessions.deleteSession(created.id, organizationId, admin.id, {});
    await expect(sessions.deleteSession(created.id, organizationId, admin.id, {})).rejects.toBeInstanceOf(NotFoundException);
    const rows = await notices('checklist_session_deleted'); expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.link).sort()).toEqual(['/instructor/checklists/sessions', '/learn/checklists']);
    await expect(sessions.update(created.id, organizationId, { version: 2, scheduledAt: null }, admin.id, {})).rejects.toBeInstanceOf(NotFoundException);
  });
  it('notifies only the learner once on concurrent completion; never publishes masked feedback/results', async () => {
    const created = await create();
    await prisma.checklistSession.update({ where: { id: created.id }, data: { strengths: 'Secret feedback', developmentAreas: 'Secret area' } });
    await prisma.checklistInstance.update({ where: { id: created.instanceId }, data: { percentage: 99, passed: true } });
    const started = await sessions.transition(created.id, organizationId, 'start', 1, observer.id, { observerId: observer.id });
    const key = randomUUID();
    await Promise.all([1, 2].map(() => sessions.transition(created.id, organizationId, 'complete', started.version, observer.id, { observerId: observer.id }, key)));
    expect(await notices('checklist_session_completed')).toMatchObject([{ userId: learner.id, data: { sessionId: created.id }, link: `/learn/checklists?sessionId=${created.id}` }]);
    const view = await sessions.get(created.id, organizationId, await access.sessionScope(learner), { isLearnerOnly: true, feedbackVisibility: 'after_completion' });
    expect(view.result.visible).toBe(false); expect(view.strengths).toBeNull();
  });
  it('creates new participant notices on repeat and deduplicates a learner who is also the observer', async () => {
    const created = await create();
    await prisma.checklistSession.update({ where: { id: created.id }, data: { status: 'completed' } });
    await prisma.checklistInstance.update({ where: { id: created.instanceId }, data: { status: 'completed' } });
    const repeated = await sessions.repeatSession(created.id, organizationId, admin.id, {});
    expect((await notices('checklist_session_scheduled')).filter((row) => (row.data as { sessionId: string }).sessionId === repeated.id)).toHaveLength(2);
    const instance = await assignment(observer.id);
    const own = await sessions.create(organizationId, { instanceId: instance.id, observerId: observer.id }, admin.id);
    expect((await notices('checklist_session_scheduled')).filter((row) => (row.data as { sessionId: string }).sessionId === own.id)).toHaveLength(1);
  });
  it('rolls back the domain change, notifications and outbox together', async () => {
    const created = await create(); const before = await prisma.notification.count({ where: { organizationId } });
    await expect(prisma.$transaction(async (tx) => {
      await tx.checklistSession.update({ where: { id: created.id }, data: { scheduledAt: new Date() } });
      await notifySessionChange(tx, created, 'checklist_session_rescheduled');
      throw new Error('abort mutation');
    })).rejects.toThrow('abort mutation');
    expect((await prisma.checklistSession.findUniqueOrThrow({ where: { id: created.id } })).scheduledAt).toBeNull();
    expect(await prisma.notification.count({ where: { organizationId } })).toBe(before);
    expect(await prisma.outboxEvent.count({ where: { topic: CHECKLIST_SESSION_CHANGE_NOTIFY_JOB, payload: { path: ['organizationId'], equals: organizationId } } })).toBe(before);
  });
  it('enforces tenant, manage scope and server-only recipients before any notification (IDOR matrix)', async () => {
    const created = await create(); const before = await prisma.notification.count({ where: { organizationId } });
    await expect(controller.updateSession(created.id, { version: 1, observerId: replacement.id }, await request(foreignAdmin, 'updateSession'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(request(learner, 'updateSession')).rejects.toBeInstanceOf(ForbiddenException);
    const manager = await user(organizationId, ['manager']);
    await expect(controller.deleteSession(created.id, await request(manager, 'deleteSession'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.createSession({ instanceId: created.instanceId, observerId: observer.id, recipientId: foreignAdmin.id }, await request(admin, 'createSession'))).rejects.toThrow();
    expect(await prisma.notification.count({ where: { organizationId } })).toBe(before);
    expect(await prisma.notification.count({ where: { organizationId: foreignOrganizationId } })).toBe(0);
    const result = await sessions.bulkCreate(organizationId, { checklistId, observerId: observer.id, learnerIds: [second.id, foreignAdmin.id] }, admin.id, {});
    expect(result).toMatchObject({ created: 1, failed: 1 });
    expect(await prisma.notification.count({ where: { userId: foreignAdmin.id } })).toBe(0);
  });
});
