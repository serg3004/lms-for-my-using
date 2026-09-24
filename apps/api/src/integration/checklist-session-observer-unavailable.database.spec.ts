/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 302 acceptance criteria, verified against real Postgres: marking the observer unavailable
// never blocks session management, is object-scoped like every other session mutation, and the
// assignment history (both the unavailable flag and the eventual reassignment) is preserved as an
// append-only ChecklistSessionEvent trail rather than a silent overwrite.
describe('checklist session observer unavailable (PR 302) — database', () => {
  let prisma: PrismaService;
  let service: ChecklistSessionService;
  let reviewAccess: ChecklistReviewAccessService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let secondObserverId: string;
  let adminId: string;
  let instanceId: string;

  function currentUser(id: string, roles: CurrentUser['roles']): CurrentUser {
    return {
      id, organizationId, email: `${id}@example.test`, firstName: 'Test', lastName: 'User',
      middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC', roles,
    };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ChecklistSessionService(prisma);
    reviewAccess = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Observer unavailable ${runId}`, slug: `observer-unavailable-${runId}` } });
    organizationId = organization.id;

    const learner = await prisma.user.create({ data: { organizationId, email: `learner-${runId}@example.test`, passwordHash: 'x', firstName: 'Leo', lastName: 'Learner' } });
    learnerId = learner.id;

    const observer = await prisma.user.create({ data: { organizationId, email: `observer-${runId}@example.test`, passwordHash: 'x', firstName: 'Obs', lastName: 'Erver' } });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const secondObserver = await prisma.user.create({ data: { organizationId, email: `observer2-${runId}@example.test`, passwordHash: 'x', firstName: 'Sec', lastName: 'Ond' } });
    secondObserverId = secondObserver.id;
    await prisma.membership.create({ data: { organizationId, userId: secondObserverId, role: 'instructor' } });

    const admin = await prisma.user.create({ data: { organizationId, email: `admin-${runId}@example.test`, passwordHash: 'x', firstName: 'Ann', lastName: 'Admin' } });
    adminId = admin.id;
    await prisma.membership.create({ data: { organizationId, userId: adminId, role: 'admin' } });

    const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Observer unavailable checklist', status: 'published' } });
    const instance = await prisma.checklistInstance.create({ data: { organizationId, checklistId: checklist.id, userId: learnerId } });
    instanceId = instance.id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.groupMember.deleteMany({ where: { organizationId } });
    await prisma.managerGroup.deleteMany({ where: { organizationId } });
    await prisma.group.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('marks the observer unavailable, notifies every org admin, and still allows the session to be started', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    // markObserverUnavailable is called with observerActionScope() in production (checklists.controller.ts),
    // not the broader read-oriented sessionScope() -- see the "review fix" describe block below for why.
    const scope = reviewAccess.observerActionScope(currentUser(observerId, ['instructor']));
    const flagged = await service.markObserverUnavailable(created.id, organizationId, 'Out sick', created.version, observerId, scope);
    expect(flagged.observerUnavailableReason).toBe('Out sick');
    expect(flagged.observerUnavailableAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { organizationId, type: 'checklist_session_observer_unavailable' } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.userId).toBe(adminId);

    // DoD: "unavailable does not block session management" -- start/complete still work exactly
    // as if the flag were never set.
    const readScope = await reviewAccess.sessionScope(currentUser(observerId, ['instructor']));
    const started = await service.transition(created.id, organizationId, 'start', flagged.version, observerId, readScope);
    expect(started.status).toBe('in_progress');
  });

  it('reassigning the observer clears the unavailable flag and preserves the full history as events', async () => {
    const adminUser = currentUser(adminId, ['admin']);
    const adminScope = await reviewAccess.sessionScope(adminUser);
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    const observerActionScope = reviewAccess.observerActionScope(currentUser(observerId, ['instructor']));
    const flagged = await service.markObserverUnavailable(created.id, organizationId, 'Out sick', created.version, observerId, observerActionScope);

    const reassigned = await service.update(created.id, organizationId, { observerId: secondObserverId, version: flagged.version }, adminId, adminScope);
    expect(reassigned.observerUnavailableReason).toBeNull();
    expect(reassigned.observerUnavailableAt).toBeNull();
    expect(reassigned.observerId).toBe(secondObserverId);

    const events = await prisma.checklistSessionEvent.findMany({ where: { organizationId, sessionId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((event) => event.eventType)).toEqual(['created', 'observer_marked_unavailable', 'rescheduled', 'observer_reassigned']);
  });

  it('rejects reassigning to the same observer instead of silently dismissing a valid unavailability report (review fix)', async () => {
    const adminScope = await reviewAccess.sessionScope(currentUser(adminId, ['admin']));
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    const observerActionScope = reviewAccess.observerActionScope(currentUser(observerId, ['instructor']));
    const flagged = await service.markObserverUnavailable(created.id, organizationId, 'Out sick', created.version, observerId, observerActionScope);

    await expect(
      service.update(created.id, organizationId, { observerId, version: flagged.version }, adminId, adminScope),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The unavailable flag must survive the rejected no-op attempt -- it was never a real reassignment.
    const stillFlagged = await prisma.checklistSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(stillFlagged.observerUnavailableReason).toBe('Out sick');
  });

  it('rejects marking unavailable once the session has started (no participant changes after start)', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    const scope = reviewAccess.observerActionScope(currentUser(observerId, ['instructor']));
    const readScope = await reviewAccess.sessionScope(currentUser(observerId, ['instructor']));
    const started = await service.transition(created.id, organizationId, 'start', created.version, observerId, readScope);

    await expect(
      service.markObserverUnavailable(created.id, organizationId, 'Too late', started.version, observerId, scope),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("denies marking unavailable for a session outside a manager's effective team scope", async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    const manager = await prisma.user.create({ data: { organizationId, email: `manager-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Man', lastName: 'Ager' } });
    await prisma.membership.create({ data: { organizationId, userId: manager.id, role: 'manager' } });
    const managerScope = reviewAccess.observerActionScope(currentUser(manager.id, ['manager']));

    await expect(
      service.markObserverUnavailable(created.id, organizationId, 'reason', created.version, manager.id, managerScope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("denies a dual manager+instructor user from marking unavailable a session they don't personally observe, even though sessionScope() (read) would allow it via the team union (review fix)", async () => {
    // The learner is in the manager's effective team (ManagerGroup membership), so sessionScope()
    // (read) legitimately includes this session for the manager -- but the manager never observed
    // it (observerId is the *other* instructor), so the write-side action must still deny it.
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    const dualRoleUser = await prisma.user.create({ data: { organizationId, email: `dual-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Dual', lastName: 'Role' } });
    await prisma.membership.create({ data: { organizationId, userId: dualRoleUser.id, role: 'manager' } });
    await prisma.membership.create({ data: { organizationId, userId: dualRoleUser.id, role: 'instructor' } });
    const group = await prisma.group.create({ data: { organizationId, name: `Team ${randomUUID()}`, slug: `team-${randomUUID()}` } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: dualRoleUser.id } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: learnerId } });

    const readScope = await reviewAccess.sessionScope(currentUser(dualRoleUser.id, ['manager', 'instructor']));
    // Sanity check: the read scope really does include this session for the dual-role user --
    // otherwise this test would pass for the wrong reason.
    const visible = await prisma.checklistSession.findFirst({ where: { id: created.id, organizationId, ...readScope } });
    expect(visible).not.toBeNull();

    const actionScope = reviewAccess.observerActionScope(currentUser(dualRoleUser.id, ['manager', 'instructor']));
    await expect(
      service.markObserverUnavailable(created.id, organizationId, 'Not actually my session', created.version, dualRoleUser.id, actionScope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
