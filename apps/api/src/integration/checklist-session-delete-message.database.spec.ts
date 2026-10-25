/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException, type ExecutionContext } from '@nestjs/common';
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

// PR 333: soft delete of a not-started session and "write to the participant" through the real
// role guard, controller and scoped Prisma queries.
describe('session delete and participant message (PR 333) — database', () => {
  let prisma: PrismaService;
  let controller: ChecklistsController;
  let sessions: ChecklistSessionService;
  let access: ChecklistReviewAccessService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let admin: CurrentUser;
  let foreignAdmin: CurrentUser;
  let observer: CurrentUser;
  let learner: CurrentUser;
  let checklistId: string;
  const viewer = { isLearnerOnly: false, feedbackVisibility: 'live' as const };

  async function user(org: string, roles: CurrentUser['roles']): Promise<CurrentUser> {
    const created = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Test', lastName: 'User' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: created.id, role })) });
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
  async function session(status: 'scheduled' | 'in_progress' | 'completed' = 'scheduled') {
    const instance = await prisma.checklistInstance.create({ data: { organizationId, checklistId, userId: learner.id } });
    const created = await prisma.checklistSession.create({
      data: {
        organizationId, instanceId: instance.id, observerId: observer.id, status,
        scheduledAt: new Date(Date.now() + 86_400_000), startedAt: status === 'scheduled' ? null : new Date(),
        strengths: 'Secret feedback', developmentAreas: 'Secret growth area',
      },
    });
    await prisma.checklistSessionReminder.create({ data: { organizationId, sessionId: created.id, reminderType: 'pre_start', scheduledFor: new Date(Date.now() + 3_600_000) } });
    return { ...created, instanceId: instance.id };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    const checklists = new ChecklistsService(prisma, {} as UploadService);
    access = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
    sessions = new ChecklistSessionService(prisma, checklists);
    controller = new ChecklistsController(checklists, {} as UploadService, access, undefined!, sessions, undefined!);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: 'Delete message', slug: `delete-message-${randomUUID()}` } });
    const foreign = await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}` } });
    organizationId = org.id; foreignOrganizationId = foreign.id;
    admin = await user(organizationId, ['admin']);
    foreignAdmin = await user(foreignOrganizationId, ['admin']);
    observer = await user(organizationId, ['instructor']);
    learner = await user(organizationId, ['learner']);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Opening shift', status: 'published' } })).id;
  });
  afterEach(async () => {
    const where = { organizationId: { in: [organizationId, foreignOrganizationId] } };
    await prisma.outboxEvent.deleteMany({});
    await prisma.notification.deleteMany({ where });
    await prisma.checklistSessionReminder.deleteMany({ where });
    await prisma.checklistSessionEvent.deleteMany({ where });
    await prisma.checklistSession.deleteMany({ where });
    await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklist.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, foreignOrganizationId] } } });
  });

  it('soft-deletes a scheduled session: hidden everywhere, history kept, reminder suppressed, assignment released', async () => {
    const created = await session();
    expect(await controller.deleteSession(created.id, await request(admin, 'deleteSession'))).toEqual({ deleted: true });

    const scope = await access.sessionScope(admin);
    await expect(sessions.get(created.id, organizationId, scope, viewer)).rejects.toBeInstanceOf(NotFoundException);
    expect((await sessions.list(organizationId, { page: 1, pageSize: 25, sort: 'scheduled' }, scope, viewer)).total).toBe(0);
    await expect(controller.deleteSession(created.id, await request(admin, 'deleteSession'))).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.checklistSession.findUnique({ where: { id: created.id } })).toMatchObject({ deletedAt: expect.any(Date) });
    expect(await prisma.checklistInstance.findUnique({ where: { id: created.instanceId } })).toMatchObject({ deletedAt: expect.any(Date) });
    expect(await prisma.checklistSessionReminder.findFirst({ where: { sessionId: created.id } })).toMatchObject({ status: 'suppressed' });
    expect(await prisma.checklistSessionEvent.findFirst({ where: { sessionId: created.id, eventType: 'deleted' } })).toMatchObject({ actorUserId: admin.id });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.deleted', targetId: created.id, actorId: admin.id } })).toBe(1);
  });

  it('refuses to delete a started or completed session and leaves it untouched', async () => {
    for (const status of ['in_progress', 'completed'] as const) {
      const created = await session(status);
      await expect(controller.deleteSession(created.id, await request(admin, 'deleteSession'))).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.checklistSession.findUnique({ where: { id: created.id } })).toMatchObject({ deletedAt: null });
      expect(await prisma.checklistSessionEvent.count({ where: { sessionId: created.id, eventType: 'deleted' } })).toBe(0);
    }
  });

  it('restricts delete and message to the manage policy and the caller’s tenant', async () => {
    const created = await session();
    for (const actor of [observer, learner]) {
      await expect(request(actor, 'deleteSession')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(request(actor, 'messageSessionParticipant')).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(controller.deleteSession(created.id, await request(foreignAdmin, 'deleteSession'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.messageSessionParticipant(created.id, { message: 'Hi' }, await request(foreignAdmin, 'messageSessionParticipant'))).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.checklistSession.findUnique({ where: { id: created.id } })).toMatchObject({ deletedAt: null });
  });

  it('sends the participant a notification and an outbox event without feedback or location', async () => {
    const created = await session();
    expect(await controller.messageSessionParticipant(created.id, { message: '  Bring your badge  ' }, await request(admin, 'messageSessionParticipant'))).toEqual({ sent: true });

    const notification = await prisma.notification.findFirstOrThrow({ where: { organizationId, userId: learner.id, type: 'checklist_session_message' } });
    expect(notification.data).toEqual({ sessionId: created.id, checklistTitle: 'Opening shift', message: 'Bring your badge' });
    expect(JSON.stringify(notification)).not.toMatch(/Secret|latitude|longitude/);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { topic: 'checklists.session-message-notify' } });
    expect(outbox.payload).toMatchObject({ recipientId: learner.id, sessionId: created.id, message: 'Bring your badge' });
    expect(JSON.stringify(outbox.payload)).not.toMatch(/Secret/);
    expect(await prisma.checklistSessionEvent.findFirst({ where: { sessionId: created.id, eventType: 'message_sent' } })).toMatchObject({ actorUserId: admin.id });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.message_sent', actorId: admin.id } })).toBe(1);
  });

  it('rejects empty/oversized text, finished sessions and a fourth message inside the window', async () => {
    const created = await session();
    const req = await request(admin, 'messageSessionParticipant');
    await expect(controller.messageSessionParticipant(created.id, { message: '   ' }, req)).rejects.toThrow();
    await expect(controller.messageSessionParticipant(created.id, { message: 'x'.repeat(501) }, req)).rejects.toThrow();
    for (let i = 0; i < 3; i++) await controller.messageSessionParticipant(created.id, { message: `Message ${i}` }, req);
    await expect(controller.messageSessionParticipant(created.id, { message: 'One more' }, req)).rejects.toMatchObject({ status: 429 });
    await expect(controller.messageSessionParticipant(created.id, { message: 'One more' }, req)).rejects.toBeInstanceOf(HttpException);
    expect(await prisma.notification.count({ where: { organizationId, type: 'checklist_session_message' } })).toBe(3);

    const done = await session('completed');
    await expect(controller.messageSessionParticipant(done.id, { message: 'Too late' }, req)).rejects.toBeInstanceOf(BadRequestException);
  });
});
