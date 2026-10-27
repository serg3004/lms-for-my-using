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
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 331/349 IDOR matrix: real membership guard + controller + scoped Prisma queries.
describe('observer session creation and conduct access (PR 331/349) — database', () => {
  let prisma: PrismaService;
  let controller: ChecklistsController;
  let sessions: ChecklistSessionService;
  let access: ChecklistReviewAccessService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let observer: CurrentUser;
  let otherObserver: CurrentUser;
  let learner: CurrentUser;
  let outsider: CurrentUser;
  let checklistId: string;
  let foreignInstanceId: string;

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
  async function instance(userId: string) {
    return prisma.checklistInstance.create({ data: { organizationId, checklistId, userId } });
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
    const org = await prisma.organization.create({ data: { name: 'Observer create', slug: `observer-create-${randomUUID()}` } });
    const foreign = await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}` } });
    organizationId = org.id; foreignOrganizationId = foreign.id;
    observer = await user(organizationId, ['instructor']);
    otherObserver = await user(organizationId, ['instructor']);
    learner = await user(organizationId, ['learner']);
    outsider = await user(foreignOrganizationId, ['learner']);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Published', status: 'published' } })).id;
    const foreignChecklist = await prisma.checklist.create({ data: { organizationId: foreignOrganizationId, title: 'Foreign', status: 'published' } });
    foreignInstanceId = (await prisma.checklistInstance.create({ data: { organizationId: foreignOrganizationId, checklistId: foreignChecklist.id, userId: outsider.id } })).id;
  });
  afterEach(async () => {
    const where = { organizationId: { in: [organizationId, foreignOrganizationId] } };
    await prisma.checklistIdempotencyKey.deleteMany({ where });
    await prisma.checklistSessionReminder.deleteMany({ where });
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
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, foreignOrganizationId] } } });
  });

  it('creates own bulk sessions, audits the actor, reads and starts the new session', async () => {
    const result = await controller.bulkCreateSessions({ checklistId, learnerIds: [learner.id], observerId: observer.id }, await request(observer, 'bulkCreateSessions'));
    expect(result.created).toBe(1);
    const sessionId = result.results[0].sessionId!;
    expect(await sessions.get(sessionId, organizationId, await access.sessionScope(observer), { isLearnerOnly: false, feedbackVisibility: 'live' })).toMatchObject({ observerId: observer.id });
    const started = await sessions.transition(sessionId, organizationId, 'start', 1, observer.id, await access.sessionScope(observer));
    expect(started.status).toBe('in_progress');
    expect(await prisma.checklistSessionEvent.findFirst({ where: { sessionId, eventType: 'created' } })).toMatchObject({ actorUserId: observer.id });
    expect(await prisma.auditLog.findFirst({ where: { organizationId, action: 'checklist_session.bulk_created' } })).toMatchObject({ actorId: observer.id });
    await expect(sessions.get(sessionId, organizationId, await access.sessionScope(otherObserver), { isLearnerOnly: false, feedbackVisibility: 'live' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['createSession', 'bulkCreateSessions'] as const)('rejects a forged observer in %s with 404 and no side effects', async (handler) => {
    const assignment = await instance(learner.id);
    for (const forgedObserverId of [otherObserver.id, outsider.id, randomUUID()]) {
      const body = handler === 'createSession' ? { instanceId: assignment.id, observerId: forgedObserverId } : { checklistId, learnerIds: [learner.id], observerId: forgedObserverId };
      await expect(controller[handler](body, await request(observer, handler))).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await prisma.checklistSession.count({ where: { organizationId } })).toBe(0);
  });

  it('rejects foreign and nonexistent assignment IDs identically; audits single creation once on replay', async () => {
    const req = await request(observer, 'createSession');
    for (const instanceId of [foreignInstanceId, randomUUID()]) {
      await expect(controller.createSession({ instanceId, observerId: observer.id }, req)).rejects.toBeInstanceOf(NotFoundException);
    }
    const assignment = await instance(learner.id);
    const body = { instanceId: assignment.id, observerId: observer.id, idempotencyKey: randomUUID() };
    const created = await controller.createSession(body, req);
    expect((await controller.createSession(body, req)).id).toBe(created.id);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.created', targetId: created.id, actorId: observer.id } })).toBe(1);
  });

  it('rejects mixed own/foreign learner batches with 404 before creating any assignment', async () => {
    await expect(controller.bulkCreateSessions({ checklistId, learnerIds: [learner.id, outsider.id], observerId: observer.id }, await request(observer, 'bulkCreateSessions'))).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.checklistInstance.count({ where: { organizationId } })).toBe(0);
    expect(await prisma.checklistSession.count({ where: { organizationId } })).toBe(0);
  });

  it('rejects foreign and nonexistent checklist IDs with 404 before any assignment', async () => {
    const foreignChecklistId = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: foreignInstanceId } })).checklistId;
    for (const id of [foreignChecklistId, randomUUID()]) {
      await expect(controller.bulkCreateSessions({ checklistId: id, learnerIds: [learner.id], observerId: observer.id }, await request(observer, 'bulkCreateSessions'))).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await prisma.checklistInstance.count({ where: { organizationId } })).toBe(0);
  });

  it('limits observer lookup to self, learner search to tenant, and excludes inactive/deleted users', async () => {
    await prisma.user.update({ where: { id: otherObserver.id }, data: { status: 'suspended' } });
    const req = await request(observer, 'listSessionParticipants');
    const observers = await controller.listSessionParticipants({ role: 'observer' }, req);
    expect(observers.items.map((row) => row.id)).toEqual([observer.id]);
    const learnerIds = (await controller.listSessionParticipants({ role: 'learner' }, req)).items.map((row) => row.id);
    expect(learnerIds).toContain(learner.id);
    expect(learnerIds).not.toContain(outsider.id);
    expect(learnerIds).not.toContain(otherObserver.id);
    await prisma.user.update({ where: { id: learner.id }, data: { deletedAt: new Date() } });
    await expect(controller.bulkCreateSessions({ checklistId, learnerIds: [learner.id], observerId: observer.id }, await request(observer, 'bulkCreateSessions'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps manager+instructor team restrictions in both pickers and direct single creation', async () => {
    const manager = await user(organizationId, ['manager', 'instructor']);
    const group = await prisma.group.create({ data: { organizationId, name: 'Managed team', slug: `team-${randomUUID()}` } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: learner.id } });
    const picked = await controller.listSessionParticipants({ role: 'learner' }, await request(manager, 'listSessionParticipants'));
    expect(picked.items.map((row) => row.id)).toEqual([learner.id]);
    const excluded = await instance(otherObserver.id);
    await expect(controller.createSession({ instanceId: excluded.id, observerId: manager.id }, await request(manager, 'createSession'))).rejects.toBeInstanceOf(NotFoundException);
    const included = await instance(learner.id);
    expect(await controller.createSession({ instanceId: included.id, observerId: manager.id }, await request(manager, 'createSession'))).toMatchObject({ observerId: manager.id });
  });

  it('does not grant an instructor general session management rights', async () => {
    for (const handler of ['updateSession', 'repeatSession', 'transitionCancel'] as const) {
      await expect(request(observer, handler)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it.each(['learner', 'mentor'] as const)('does not grant creation or participant enumeration to %s', async (role) => {
    const denied = await user(organizationId, [role]);
    for (const handler of ['createSession', 'bulkCreateSessions', 'listSessionParticipants'] as const) {
      await expect(request(denied, handler)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  async function managedSession(status: 'scheduled' | 'in_progress' | 'paused' = 'scheduled', own = false) {
    const actor = await user(organizationId, ['manager', 'instructor']);
    const group = await prisma.group.create({ data: { organizationId, name: 'Conduct audit team', slug: `audit-${randomUUID()}` } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: actor.id } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: learner.id } });
    const assigned = await instance(learner.id);
    const session = await sessions.create(organizationId, { instanceId: assigned.id, observerId: own ? actor.id : observer.id, locationCapturePolicy: 'required' }, observer.id);
    await prisma.checklistSession.update({ where: { id: session.id }, data: { status, contextFieldsSnapshot: [], contextValues: {} } });
    return { actor, session };
  }

  const conductActions = [
    ['start', 'transitionStart', 'scheduled'], ['pause', 'transitionPause', 'in_progress'],
    ['resume', 'transitionResume', 'paused'], ['complete', 'transitionComplete', 'in_progress'],
    ['feedback', 'submitFeedback', 'in_progress'], ['context', 'submitContext', 'in_progress'],
    ['location', 'captureLocation', 'in_progress'],
  ] as const;

  it.each(conductActions)('PR 349: team read access never grants another observer’s %s action', async (action, handler, status) => {
    const { actor, session } = await managedSession(status);
    expect(await sessions.get(session.id, organizationId, await access.sessionScope(actor), { isLearnerOnly: false, feedbackVisibility: 'live' })).toMatchObject({ id: session.id });
    const req = await request(actor, handler);
    const eventsBefore = await prisma.checklistSessionEvent.count({ where: { organizationId, sessionId: session.id } });
    const operation = action === 'location'
      ? controller.captureLocation(session.id, 'start', { status: 'denied', overrideReason: 'This caller is not an admin' }, req)
      : action === 'feedback' ? controller.submitFeedback(session.id, { version: 1, strengths: 'Not my evaluation' }, req)
      : action === 'context' ? controller.submitContext(session.id, { version: 1, values: {} }, req)
      : controller[handler as 'transitionStart' | 'transitionPause' | 'transitionResume' | 'transitionComplete'](session.id, { version: 1 }, req);
    await expect(operation).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.checklistSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status, version: 1, strengths: null });
    expect(await prisma.checklistSessionEvent.count({ where: { organizationId, sessionId: session.id } })).toBe(eventsBefore);
    expect(await prisma.checklistLocationCapture.count({ where: { organizationId, sessionId: session.id } })).toBe(0);
  });

  it('PR 349: own conduct, manager cancellation and admin override remain allowed', async () => {
    const own = await managedSession('scheduled', true);
    expect(await controller.transitionStart(own.session.id, { version: 1 }, await request(own.actor, 'transitionStart'))).toMatchObject({ status: 'in_progress' });
    const team = await managedSession();
    expect(await controller.transitionCancel(team.session.id, { version: 1 }, await request(team.actor, 'transitionCancel'))).toMatchObject({ status: 'cancelled' });
    const other = await managedSession();
    const admin = await user(organizationId, ['admin']);
    expect(await controller.transitionStart(other.session.id, { version: 1 }, await request(admin, 'transitionStart'))).toMatchObject({ status: 'in_progress' });
  });

  it('PR 349: a cached transition cannot bypass current observer scope', async () => {
    const { actor, session } = await managedSession();
    const admin = await user(organizationId, ['admin']);
    const key = randomUUID();
    await controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(admin, 'transitionStart'));
    await expect(controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(actor, 'transitionStart'))).rejects.toBeInstanceOf(NotFoundException);
    expect(await controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(observer, 'transitionStart'))).toMatchObject({ id: session.id, version: 2 });
    expect(await prisma.checklistSessionEvent.count({ where: { organizationId, sessionId: session.id, eventType: 'started' } })).toBe(1);
  });
});
