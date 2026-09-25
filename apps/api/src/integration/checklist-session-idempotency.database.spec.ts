/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// A replayed response comes back from the ChecklistIdempotencyKey.responseBody JSONB column,
// where Date fields were already serialized to ISO strings on the way in -- exactly what the
// HTTP layer would have sent a real caller either way, but not `toEqual`-identical to the fresh
// call's in-process object (which still holds real Date instances). Round-tripping the fresh
// response through JSON first normalizes both sides to what a client actually receives.
function asJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

// PR 301 acceptance criteria, verified against real Postgres: a network retry of create/
// transition/recalculate that carries the same client-supplied idempotencyKey never produces a
// second row, and a genuinely concurrent double-send of create resolves to exactly one session.
describe('checklist session idempotency (PR 301) — database', () => {
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
    const organization = await prisma.organization.create({ data: { name: `Idempotency ${runId}`, slug: `idempotency-${runId}` } });
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
      data: { organizationId, title: 'Idempotency checklist', status: 'published', scoringMode: 'sum_points', passThreshold: 80 },
    });
    checklistId = checklist.id;
    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Only item', points: 10, isRequired: true },
    });
    itemId = item.id;
  });

  afterEach(async () => {
    await prisma.checklistIdempotencyKey.deleteMany({ where: { organizationId } });
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

  it('a create() retry with the same idempotencyKey replays the first response instead of erroring, and only one session row exists', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    const key = randomUUID();

    const first = await sessionService.create(organizationId, { instanceId: instance.id, observerId, idempotencyKey: key }, observerId);
    const retry = await sessionService.create(organizationId, { instanceId: instance.id, observerId, idempotencyKey: key }, observerId);

    expect(asJson(retry)).toEqual(asJson(first));
    const sessions = await prisma.checklistSession.findMany({ where: { organizationId, instanceId: instance.id } });
    expect(sessions).toHaveLength(1);
    const createdEvents = await prisma.checklistSessionEvent.findMany({ where: { organizationId, sessionId: first.id, eventType: 'created' } });
    expect(createdEvents).toHaveLength(1);
  });

  it('two genuinely concurrent create() calls with the same idempotencyKey resolve to exactly one session', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    const key = randomUUID();

    const [a, b] = await Promise.all([
      sessionService.create(organizationId, { instanceId: instance.id, observerId, idempotencyKey: key }, observerId),
      sessionService.create(organizationId, { instanceId: instance.id, observerId, idempotencyKey: key }, observerId),
    ]);

    expect(a.id).toBe(b.id);
    const sessions = await prisma.checklistSession.findMany({ where: { organizationId, instanceId: instance.id } });
    expect(sessions).toHaveLength(1);
  });

  it('a transition() retry with the same idempotencyKey replays the original response even once the version has moved on (no 409)', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    const session = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    const scope = await reviewAccess.sessionScope(currentUser(observerId, ['instructor']));
    const key = randomUUID();

    const first = await sessionService.transition(session.id, organizationId, 'start', session.version, observerId, scope, key);
    // A genuine retry replays the same (now-stale) expectedVersion the client originally sent --
    // without the idempotencyKey this would be a 409, not the original success payload.
    const retry = await sessionService.transition(session.id, organizationId, 'start', session.version, observerId, scope, key);

    expect(asJson(retry)).toEqual(asJson(first));
    const startedEvents = await prisma.checklistSessionEvent.findMany({ where: { organizationId, sessionId: session.id, eventType: 'started' } });
    expect(startedEvents).toHaveLength(1);
    const stored = await prisma.checklistSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.version).toBe(session.version + 1);
  });

  it('a recalculateScore() retry with the same idempotencyKey does not write a second revision or audit entry', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    await checklistsService.submitItemResult(instance.id, itemId, organizationId, learnerId, false, { checked: true });
    const session = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    const adminScope = await reviewAccess.sessionScope(currentUser(adminId, ['admin']));
    const key = randomUUID();

    const first = await sessionService.recalculateScore(session.id, organizationId, 'Fixing a scoring bug', adminId, adminScope, key);
    const retry = await sessionService.recalculateScore(session.id, organizationId, 'Fixing a scoring bug', adminId, adminScope, key);

    expect(asJson(retry)).toEqual(asJson(first));
    const revisions = await prisma.checklistScoreRevision.findMany({ where: { organizationId, instanceId: instance.id } });
    expect(revisions).toHaveLength(1);
    const auditEntries = await prisma.auditLog.findMany({ where: { organizationId, action: 'checklist_score_revision.created' } });
    expect(auditEntries).toHaveLength(1);
  });

  it('replays a legacy recalculateScore() idempotency cache row (written before `scored` was added to the response) with the instance\'s real scored flag, not undefined', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    await checklistsService.submitItemResult(instance.id, itemId, organizationId, learnerId, false, { checked: true });
    const session = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    const adminScope = await reviewAccess.sessionScope(currentUser(adminId, ['admin']));
    const key = randomUUID();

    const first = await sessionService.recalculateScore(session.id, organizationId, 'Fixing a scoring bug', adminId, adminScope, key);
    expect(first.scored).toBe(true);

    // Simulate a row cached by the pre-fix implementation, which stored the bare
    // ChecklistScoreRevision (no `scored` field) as responseBody.
    const revisionOnly = asJson(first) as Record<string, unknown>;
    delete revisionOnly.scored;
    await prisma.checklistIdempotencyKey.update({
      where: { organizationId_scope_key: { organizationId, scope: 'session.recalculate', key } },
      data: { responseBody: revisionOnly as object },
    });

    const replayed = await sessionService.recalculateScore(session.id, organizationId, 'Fixing a scoring bug', adminId, adminScope, key);
    expect(replayed.scored).toBe(true);
    const revisions = await prisma.checklistScoreRevision.findMany({ where: { organizationId, instanceId: instance.id } });
    expect(revisions).toHaveLength(1);
  });
});
