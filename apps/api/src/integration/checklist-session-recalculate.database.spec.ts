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

  async function unequalCriteriaSession() {
    await prisma.checklistItem.update({ where: { id: itemId }, data: { points: 90, weight: 2 } });
    const second = await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 1, text: 'Second', points: 10, isRequired: false } });
    const skipped = await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 2, text: 'Skipped', points: 100, allowSkip: true, isRequired: false } });
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, adminId);
    await prisma.checklistItemResult.createMany({ data: [
      { organizationId, instanceId: instance.id, itemId, checked: true, points: 90, answerState: 'answered', reviewStatus: 'approved' },
      { organizationId, instanceId: instance.id, itemId: second.id, checked: false, points: 0, answerState: 'answered' },
      { organizationId, instanceId: instance.id, itemId: skipped.id, checked: false, points: 0, answerState: 'skipped' },
    ] });
    await prisma.checklistInstance.update({ where: { id: instance.id }, data: { status: 'completed' } });
    const session = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, adminId);
    return { instanceId: instance.id, sessionId: session.id };
  }

  it('chooses equal criteria or frozen points, preserves old revisions and replays the original formula after later changes (PR 335)', async () => {
    const { instanceId, sessionId } = await unequalCriteriaSession();
    const resultsBefore = await prisma.checklistItemResult.findMany({ where: { instanceId }, orderBy: { id: 'asc' } });
    const original = await sessionService.recalculateScore(sessionId, organizationId, 'Check original', adminId, {});
    expect(original).toMatchObject({ formula: 'snapshot', newPercentage: 95, newPassed: true });
    const originalRow = await prisma.checklistScoreRevision.findUniqueOrThrow({ where: { id: original.id } });
    // Live edits must not change the denominator or pass threshold from the assignment snapshot.
    await prisma.checklist.update({ where: { id: checklistId }, data: { passThreshold: 10 } });
    await prisma.checklistItem.update({ where: { id: itemId }, data: { points: 1000, weight: 100 } });
    const key = randomUUID();
    const criteria = await sessionService.recalculateScore(sessionId, organizationId, 'Equal criteria', adminId, {}, key, 'criteria');
    expect(criteria).toMatchObject({ formula: 'criteria', previousPercentage: 95, newPercentage: 50, newPassed: false, scored: true });
    expect(await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).toMatchObject({ totalScore: 1, maxScore: 2, percentage: 50, status: 'completed', passed: false });
    await sessionService.recalculateScore(sessionId, organizationId, 'Original formula again', adminId, {}, randomUUID(), 'snapshot');
    const replay = await sessionService.recalculateScore(sessionId, organizationId, 'Equal criteria', adminId, {}, key, 'snapshot');
    expect(replay).toMatchObject({ id: criteria.id, formula: 'criteria', newPercentage: 50 });
    expect(await prisma.checklistScoreRevision.count({ where: { instanceId } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_score_revision.created' } })).toBe(3);
    expect(await prisma.checklistScoreRevision.findUniqueOrThrow({ where: { id: original.id } })).toEqual(originalRow);
    expect(await prisma.checklistItemResult.findMany({ where: { instanceId }, orderBy: { id: 'asc' } })).toEqual(resultsBefore);
    expect(await prisma.checklistSessionEvent.findFirst({ where: { sessionId, eventType: 'score_recalculated', metadata: { path: ['revisionId'], equals: criteria.id } } })).toMatchObject({ metadata: expect.objectContaining({ formula: 'criteria' }) });
    expect(await prisma.auditLog.findFirst({ where: { organizationId, action: 'checklist_score_revision.created', metadata: { path: ['formula'], equals: 'criteria' } } })).not.toBeNull();
  });

  it('serializes concurrent retries to one criteria revision and one audit entry (PR 335)', async () => {
    const { sessionId, instanceId } = await unequalCriteriaSession();
    const key = randomUUID();
    const revisions = await Promise.all([1, 2].map(() => sessionService.recalculateScore(sessionId, organizationId, 'Concurrent retry', adminId, {}, key, 'criteria')));
    expect(revisions[0]?.id).toBe(revisions[1]?.id);
    expect(revisions[0]).toMatchObject({ formula: 'criteria', newPercentage: 50 });
    expect(await prisma.checklistScoreRevision.count({ where: { instanceId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_score_revision.created' } })).toBe(1);
  });

  it('recovers formula and not-scored from an immutable revision for pre-formula idempotency JSON (PR 335)', async () => {
    const { instanceId, sessionId } = await unequalCriteriaSession();
    await prisma.checklistItemResult.updateMany({ where: { instanceId }, data: { answerState: 'skipped', checked: false, points: 0 } });
    const key = randomUUID();
    const first = await sessionService.recalculateScore(sessionId, organizationId, 'All skipped', adminId, {}, key, 'criteria');
    expect(first).toMatchObject({ formula: 'criteria', scored: false, newPercentage: 0 });
    const legacy = { ...first } as Record<string, unknown>;
    delete legacy.formula; delete legacy.scored; delete legacy.newScored;
    await prisma.checklistIdempotencyKey.update({ where: { organizationId_scope_key: { organizationId, scope: 'session.recalculate', key } }, data: { responseBody: JSON.parse(JSON.stringify(legacy)) } });
    await prisma.checklistInstance.update({ where: { id: instanceId }, data: { scored: true, percentage: 100 } });
    expect(await sessionService.recalculateScore(sessionId, organizationId, 'Retry', adminId, {}, key)).toMatchObject({ id: first.id, formula: 'criteria', scored: false, newScored: false, newPercentage: 0 });
    expect(await prisma.checklistScoreRevision.count({ where: { instanceId } })).toBe(1);
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
