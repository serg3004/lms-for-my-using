/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../database/prisma.service.js';
import { RolesGuard } from '../modules/auth/roles.guard.js';
import type { AuthenticatedRequest, CurrentUser } from '../modules/auth/public.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistWorkplaceSettingsService } from '../modules/checklists/checklist-workplace-settings.service.js';
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
  let workplaceSettings: ChecklistWorkplaceSettingsService;
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
    workplaceSettings = new ChecklistWorkplaceSettingsService(prisma);
    controller = new ChecklistsController(checklists, {} as UploadService, access, workplaceSettings, sessions, undefined!);
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

  it('PR 351: default observer lookup includes active instructors, managers and admins only', async () => {
    const admin = await user(organizationId, ['admin']);
    const manager = await user(organizationId, ['manager']);
    const mentor = await user(organizationId, ['mentor']);
    await prisma.user.update({ where: { id: otherObserver.id }, data: { status: 'suspended' } });
    const result = await controller.listSessionParticipants({ role: 'observer' }, await request(admin, 'listSessionParticipants'));
    expect(result.items.map((item) => item.id).sort()).toEqual([admin.id, manager.id, observer.id].sort());
    expect(result.items.map((item) => item.id)).not.toContain(mentor.id);
    for (const eligible of [manager, admin]) {
      const assigned = await instance(learner.id);
      expect(await controller.createSession({ instanceId: assigned.id, observerId: eligible.id }, await request(admin, 'createSession'))).toMatchObject({ observerId: eligible.id });
    }
    expect(await prisma.checklistWorkplaceSettings.count({ where: { organizationId } })).toBe(0);
  });

  it.each(['any_user', 'selected_roles', 'selected_users'] as const)('PR 351: %s filters lookup and authorizes creation from the same selection', async (mode) => {
    const admin = await user(organizationId, ['admin']);
    const manager = await user(organizationId, ['manager']);
    const mentor = await user(organizationId, ['mentor']);
    const employee = await user(organizationId, ['learner']);
    const noRole = await user(organizationId, []);
    const blocked = await user(organizationId, ['instructor']);
    const deleted = await user(organizationId, ['instructor']);
    await prisma.user.update({ where: { id: blocked.id }, data: { status: 'suspended' } });
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await controller.updateWorkplaceSettings({ observerEligibility: mode, observerRoles: ['mentor'], observerUserIds: [employee.id] }, await request(admin, 'updateWorkplaceSettings'));
    const all = [admin, manager, mentor, employee, noRole, observer, otherObserver, learner];
    const eligible = mode === 'any_user' ? all : mode === 'selected_roles' ? [mentor] : [employee];
    const lookup = await controller.listSessionParticipants({ role: 'observer', pageSize: 100 }, await request(admin, 'listSessionParticipants'));
    expect(lookup.items.map((item) => item.id).sort()).toEqual(eligible.map((item) => item.id).sort());
    for (const candidate of [...all, blocked, deleted, outsider]) {
      const assigned = await instance(learner.id);
      const action = controller.createSession({ instanceId: assigned.id, observerId: candidate.id }, await request(admin, 'createSession'));
      if (candidate.id !== learner.id && eligible.some((item) => item.id === candidate.id)) await expect(action).resolves.toMatchObject({ observerId: candidate.id });
      else {
        await expect(action).rejects.toBeInstanceOf(BadRequestException);
        expect(await prisma.checklistSession.count({ where: { instanceId: assigned.id } })).toBe(0);
      }
    }
    const searched = await controller.listSessionParticipants({ role: 'observer', search: employee.email, pageSize: 1 }, await request(admin, 'listSessionParticipants'));
    expect(searched.total).toBe(mode === 'selected_roles' ? 0 : 1);
    const page = await controller.listSessionParticipants({ role: 'observer', page: 2, pageSize: 1 }, await request(admin, 'listSessionParticipants'));
    expect(page.items).toHaveLength(eligible.length > 1 ? 1 : 0);
    await expect(request(manager, 'updateWorkplaceSettings')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PR 351: invalid explicit users never change settings or write an audit', async () => {
    const admin = await user(organizationId, ['admin']);
    const blocked = await user(organizationId, ['instructor']);
    await prisma.user.update({ where: { id: blocked.id }, data: { status: 'suspended' } });
    for (const id of [outsider.id, blocked.id, randomUUID()]) {
      await expect(controller.updateWorkplaceSettings({ observerEligibility: 'selected_users', observerUserIds: [id] }, await request(admin, 'updateWorkplaceSettings'))).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await prisma.checklistWorkplaceSettings.count({ where: { organizationId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_workplace_settings.updated' } })).toBe(0);
  });

  it('PR 351: changing eligibility preserves existing conduct and time-only edits, but guards future assignment', async () => {
    const admin = await user(organizationId, ['admin']);
    const manager = await user(organizationId, ['manager']);
    const first = await sessions.create(organizationId, { instanceId: (await instance(learner.id)).id, observerId: observer.id }, admin.id);
    const second = await sessions.create(organizationId, { instanceId: (await instance(learner.id)).id, observerId: observer.id }, admin.id);
    await controller.updateWorkplaceSettings({ observerEligibility: 'selected_roles', observerRoles: ['manager'] }, await request(admin, 'updateWorkplaceSettings'));
    expect(await controller.getSession(first.id, await request(observer, 'getSession'))).toMatchObject({ observerId: observer.id });
    expect(await controller.transitionStart(first.id, { version: 1 }, await request(observer, 'transitionStart'))).toMatchObject({ status: 'in_progress' });
    expect(await controller.updateSession(second.id, { version: 1, scheduledAt: '2027-01-01T10:00:00Z' }, await request(admin, 'updateSession'))).toMatchObject({ observerId: observer.id, version: 2 });
    await expect(controller.updateSession(second.id, { version: 2, observerId: otherObserver.id }, await request(admin, 'updateSession'))).rejects.toBeInstanceOf(BadRequestException);
    expect(await controller.updateSession(second.id, { version: 2, observerId: manager.id }, await request(admin, 'updateSession'))).toMatchObject({ observerId: manager.id, version: 3 });
    expect(await controller.transitionStart(second.id, { version: 3 }, await request(manager, 'transitionStart'))).toMatchObject({ status: 'in_progress' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'checklist_workplace_settings.updated' } });
    expect(audit.metadata).toMatchObject({ previous: { observerEligibility: 'selected_roles', observerRoles: ['instructor', 'manager', 'admin'] }, updated: { observerRoles: ['manager'] } });
  });

  it('PR 351: explicit-list names are admin-only and empty selections deny all new observers', async () => {
    const admin = await user(organizationId, ['admin']);
    await controller.updateWorkplaceSettings({ observerEligibility: 'selected_users', observerUserIds: [observer.id] }, await request(admin, 'updateWorkplaceSettings'));
    expect(await controller.getWorkplaceSettings(await request(admin, 'getWorkplaceSettings'))).toMatchObject({ selectedObserverUsers: [{ id: observer.id, email: observer.email }] });
    expect(await controller.getWorkplaceSettings(await request(learner, 'getWorkplaceSettings'))).not.toHaveProperty('selectedObserverUsers');
    await controller.updateWorkplaceSettings({ observerUserIds: [] }, await request(admin, 'updateWorkplaceSettings'));
    expect((await controller.listSessionParticipants({ role: 'observer' }, await request(admin, 'listSessionParticipants'))).total).toBe(0);
    await controller.updateWorkplaceSettings({ observerEligibility: 'selected_roles', observerRoles: [] }, await request(admin, 'updateWorkplaceSettings'));
    expect((await controller.listSessionParticipants({ role: 'observer' }, await request(admin, 'listSessionParticipants'))).total).toBe(0);
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

  it('PR 349: own conduct and manager cancellation remain allowed; admin cannot conduct for another observer', async () => {
    const own = await managedSession('scheduled', true);
    expect(await controller.transitionStart(own.session.id, { version: 1 }, await request(own.actor, 'transitionStart'))).toMatchObject({ status: 'in_progress' });
    const team = await managedSession();
    expect(await controller.transitionCancel(team.session.id, { version: 1 }, await request(team.actor, 'transitionCancel'))).toMatchObject({ status: 'cancelled' });
    const other = await managedSession();
    const admin = await user(organizationId, ['admin']);
    await expect(controller.transitionStart(other.session.id, { version: 1 }, await request(admin, 'transitionStart'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PR 349: a cached transition cannot bypass current observer scope', async () => {
    const { actor, session } = await managedSession();
    const key = randomUUID();
    await controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(observer, 'transitionStart'));
    await expect(controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(actor, 'transitionStart'))).rejects.toBeInstanceOf(NotFoundException);
    expect(await controller.transitionStart(session.id, { version: 1, idempotencyKey: key }, await request(observer, 'transitionStart'))).toMatchObject({ id: session.id, version: 2 });
    expect(await prisma.checklistSessionEvent.count({ where: { organizationId, sessionId: session.id, eventType: 'started' } })).toBe(1);
  });
  it.each(['admin', 'manager', 'instructor', 'mentor', 'learner'] as const)(
    'PR 352: %s conducts only assigned sessions; tenant and object boundaries hold', async (role) => {
      const actor = await user(organizationId, [role]);
      await workplaceSettings.updateSettings(organizationId, { observerEligibility: 'any_user' }, actor.id);
      const own = await sessions.create(organizationId, { instanceId: (await instance(learner.id)).id, observerId: actor.id }, observer.id);
      const other = await sessions.create(organizationId, { instanceId: (await instance(learner.id)).id, observerId: otherObserver.id }, observer.id);
      const foreign = await prisma.checklistSession.create({ data: { organizationId: foreignOrganizationId, instanceId: foreignInstanceId, observerId: outsider.id } });
      const queue = await controller.listOwnSessions({ observerId: otherObserver.id }, await request(actor, 'listOwnSessions'));
      expect(queue.items).toEqual([]); // forged query cannot replace mandatory own scope
      expect((await controller.listOwnSessions({}, await request(actor, 'listOwnSessions'))).items.map((row) => row.id)).toEqual([own.id]);
      expect(await controller.getConductSession(own.id, await request(actor, 'getConductSession'))).toMatchObject({ observerId: actor.id });
      for (const deniedId of [other.id, foreign.id, randomUUID()]) {
        await expect(controller.getConductSession(deniedId, await request(actor, 'getConductSession'))).rejects.toBeInstanceOf(NotFoundException);
        for (const handler of ['transitionStart', 'transitionPause', 'transitionResume', 'transitionComplete'] as const) {
          await expect(controller[handler](deniedId, { version: 1 }, await request(actor, handler))).rejects.toBeInstanceOf(NotFoundException);
        }
        await expect(controller.submitFeedback(deniedId, { version: 1, strengths: 'Forged' }, await request(actor, 'submitFeedback'))).rejects.toBeInstanceOf(NotFoundException);
        await expect(controller.submitContext(deniedId, { version: 1, values: {} }, await request(actor, 'submitContext'))).rejects.toBeInstanceOf(NotFoundException);
        await expect(controller.captureLocation(deniedId, 'start', { status: 'denied' }, await request(actor, 'captureLocation'))).rejects.toBeInstanceOf(NotFoundException);
      }
      // Service rejects an unsafe broad scope too, including cached transitions.
      await expect(sessions.transition(other.id, organizationId, 'start', 1, actor.id, {})).rejects.toBeInstanceOf(NotFoundException);
      if (role === 'manager') {
        await expect(controller.updateSession(own.id, { version: 1, scheduledAt: '2027-01-01T09:00:00Z' }, await request(actor, 'updateSession'))).rejects.toBeInstanceOf(NotFoundException);
        expect((await controller.exportSessions({ observerId: actor.id }, await request(actor, 'exportSessions'))).rowCount).toBe(0);
      }
      const key = randomUUID();
      let current = await controller.transitionStart(own.id, { version: 1, idempotencyKey: key }, await request(actor, 'transitionStart'));
      expect((await controller.transitionStart(own.id, { version: 1, idempotencyKey: key }, await request(actor, 'transitionStart'))).version).toBe(current.version);
      current = await controller.submitContext(own.id, { version: current.version, values: {} }, await request(actor, 'submitContext'));
      current = await controller.submitFeedback(own.id, { version: current.version, strengths: 'Observed result' }, await request(actor, 'submitFeedback'));
      current = await controller.transitionPause(own.id, { version: current.version }, await request(actor, 'transitionPause'));
      current = await controller.transitionResume(own.id, { version: current.version }, await request(actor, 'transitionResume'));
      current = await controller.transitionComplete(own.id, { version: current.version }, await request(actor, 'transitionComplete'));
      expect(current.status).toBe('completed');
      expect(await prisma.checklistSessionEvent.count({ where: { sessionId: own.id, eventType: 'started', actorUserId: actor.id } })).toBe(1);
      expect(await prisma.checklistSessionEvent.count({ where: { sessionId: own.id, eventType: 'completed', actorUserId: actor.id } })).toBe(1);
      if (role === 'learner' || role === 'mentor') {
        for (const handler of ['createSession', 'updateSession', 'exportSessions', 'recalculateScore'] as const) {
          // These grants are independent of an observer assignment.
          await expect(request(actor, handler)).rejects.toBeInstanceOf(ForbiddenException);
        }
      }
    },
  );

  it('PR 352: blocks self-observation in single/bulk creation and reassignment without side effects', async () => {
    const admin = await user(organizationId, ['admin']);
    await workplaceSettings.updateSettings(organizationId, { observerEligibility: 'any_user' }, admin.id);
    const assigned = await instance(learner.id);
    for (const observerId of [learner.id, learner.id.toUpperCase()]) {
      await expect(controller.createSession({ instanceId: assigned.id, observerId }, await request(admin, 'createSession'))).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.bulkCreateSessions({ checklistId, learnerIds: [learner.id], observerId }, await request(admin, 'bulkCreateSessions'))).rejects.toBeInstanceOf(BadRequestException);
      // The service must enforce identity without relying on HTTP normalization.
      await expect(sessions.create(organizationId, { instanceId: assigned.id, observerId }, admin.id)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await prisma.checklistSession.count({ where: { organizationId } })).toBe(0);
    const valid = await sessions.create(organizationId, { instanceId: assigned.id, observerId: observer.id }, admin.id);
    for (const observerId of [learner.id, learner.id.toUpperCase(), observer.id.toUpperCase()]) {
      await expect(controller.updateSession(valid.id, { version: 1, observerId }, await request(admin, 'updateSession'))).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await prisma.checklistSession.findUniqueOrThrow({ where: { id: valid.id } })).toMatchObject({ observerId: observer.id, version: 1 });
  });

  it.each(['admin', 'manager', 'instructor', 'mentor', 'learner'] as const)(
    'PR 352: %s can read and answer the observed instance, with no unrelated item access', async (role) => {
      const actor = await user(organizationId, [role]);
      await workplaceSettings.updateSettings(organizationId, { observerEligibility: 'any_user' }, actor.id);
      const item = await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'Observed criterion', points: 1, isRequired: true } });
      const optionalItem = await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 1, text: 'Can skip', points: 1, allowSkip: true, isRequired: false } });
      const checklists = new ChecklistsService(prisma, {} as UploadService);
      const ownInstance = await checklists.assignChecklist(checklistId, organizationId, { userId: learner.id }, observer.id);
      const otherInstance = await instance(learner.id);
      const ownSession = await sessions.create(organizationId, { instanceId: ownInstance.id, observerId: actor.id }, observer.id);
      await controller.transitionStart(ownSession.id, { version: 1 }, await request(actor, 'transitionStart'));
      await sessions.create(organizationId, { instanceId: otherInstance.id, observerId: otherObserver.id }, observer.id);
      expect(await controller.getInstance(ownInstance.id, await request(actor, 'getInstance'))).toMatchObject({ userId: learner.id });
      expect(await controller.skipItem(ownInstance.id, optionalItem.id, {}, await request(actor, 'skipItem'))).toMatchObject({ id: ownInstance.id });
      expect(await controller.submitItemResult(ownInstance.id, item.id, { checked: true }, await request(actor, 'submitItemResult'))).toMatchObject({ id: ownInstance.id });
      for (const target of [otherInstance.id, foreignInstanceId, randomUUID()]) {
        // Even a caller with broad reviewer/admin permission cannot fill another observer's session.
        await expect(checklists.submitItemResult(target, item.id, organizationId, actor.id, true, { checked: true })).rejects.toBeInstanceOf(NotFoundException);
        await expect(checklists.skipItem(target, item.id, organizationId, actor.id, true, { comment: 'forged' })).rejects.toBeInstanceOf(NotFoundException);
        await expect(checklists.assertInstanceWritable(target, organizationId, actor.id, true)).rejects.toBeInstanceOf(NotFoundException);
      }
      await expect(checklists.submitItemResult(ownInstance.id, item.id, organizationId, learner.id, false, { checked: true })).rejects.toBeInstanceOf(NotFoundException);
    },
  );

});
