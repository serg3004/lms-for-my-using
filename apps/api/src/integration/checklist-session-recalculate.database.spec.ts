/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 300 acceptance criteria, verified against real Postgres: recalculate re-derives the score
// from persisted ChecklistItemResult rows, always writes a ChecklistScoreRevision (the audit
// trail), and is denied for a caller outside the session's object scope.
describe('checklist session recalculate (PR 300) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let reviewAccess: ChecklistReviewAccessService;
  let organizationId: string;
  let observerId: string;
  let learnerId: string;
  let adminId: string;
  let checklistId: string;
  let itemId: string;

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
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma, checklistsService);
    reviewAccess = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Recalc ${runId}`, slug: `recalc-${runId}` } });
    organizationId = organization.id;

    const observer = await prisma.user.create({ data: { organizationId, email: `observer-${runId}@example.test`, passwordHash: 'x', firstName: 'Obs', lastName: 'Erver' } });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const learner = await prisma.user.create({ data: { organizationId, email: `learner-${runId}@example.test`, passwordHash: 'x', firstName: 'Leo', lastName: 'Learner' } });
    learnerId = learner.id;

    const admin = await prisma.user.create({ data: { organizationId, email: `admin-${runId}@example.test`, passwordHash: 'x', firstName: 'Ann', lastName: 'Admin' } });
    adminId = admin.id;
    await prisma.membership.create({ data: { organizationId, userId: adminId, role: 'admin' } });

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Recalculate checklist', status: 'published', scoringMode: 'sum_points', passThreshold: 80 },
    });
    checklistId = checklist.id;
    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Only item', points: 10, isRequired: true },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.checklistScoreRevision.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  async function completeInstanceAndSession() {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    await checklistsService.submitItemResult(instance.id, itemId, organizationId, learnerId, false, { checked: true });
    const session = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    return { instanceId: instance.id, sessionId: session.id };
  }

  it('recalculates from persisted results, fixing a corrupted stored score, and records a revision + event + audit log', async () => {
    const { instanceId, sessionId } = await completeInstanceAndSession();

    // Simulate a scoring bug: the stored percentage/passed/totalScore no longer match the
    // persisted results.
    await prisma.checklistInstance.update({ where: { id: instanceId }, data: { percentage: 0, passed: false, totalScore: 0 } });

    const adminScope = await reviewAccess.sessionScope(currentUser(adminId, ['admin']));
    const revision = await sessionService.recalculateScore(sessionId, organizationId, 'Fixing a scoring bug found in support ticket #123', adminId, adminScope);

    expect(revision).toMatchObject({ organizationId, instanceId, previousPercentage: 0, newPercentage: 100, previousPassed: false, newPassed: true, reason: 'Fixing a scoring bug found in support ticket #123', actorUserId: adminId });

    const instance = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(instance).toMatchObject({ percentage: 100, passed: true, totalScore: 10, maxScore: 10, scored: true });

    const events = await prisma.checklistSessionEvent.findMany({ where: { organizationId, sessionId, eventType: 'score_recalculated' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ previousPercentage: 0, newPercentage: 100 });

    const auditEntries = await prisma.auditLog.findMany({ where: { organizationId, action: 'checklist_score_revision.created' } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]?.targetId).toBe(instanceId);
  });

  it('still writes a revision (no-op recalculation) when the stored score was already correct', async () => {
    const { sessionId, instanceId } = await completeInstanceAndSession();

    const adminScope = await reviewAccess.sessionScope(currentUser(adminId, ['admin']));
    const revision = await sessionService.recalculateScore(sessionId, organizationId, 'Double-checking after a learner dispute', adminId, adminScope);

    expect(revision).toMatchObject({ previousPercentage: 100, newPercentage: 100, previousPassed: true, newPassed: true });
    const revisions = await sessionService.listScoreRevisions(sessionId, organizationId, adminScope);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.instanceId).toBe(instanceId);
  });

  it("denies recalculating a session outside a manager's effective team scope", async () => {
    const { sessionId } = await completeInstanceAndSession();

    const manager = await prisma.user.create({ data: { organizationId, email: `manager-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Man', lastName: 'Ager' } });
    await prisma.membership.create({ data: { organizationId, userId: manager.id, role: 'manager' } });
    // No ManagerGroup/DepartmentManager relation to the learner -> empty effective team scope.
    const managerScope = await reviewAccess.sessionScope(currentUser(manager.id, ['manager']));

    await expect(sessionService.recalculateScore(sessionId, organizationId, 'trying anyway', manager.id, managerScope)).rejects.toBeInstanceOf(NotFoundException);
  });
});
