/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// Exercises the PR 289 session-lifecycle state machine against a real Postgres instance. The
// mocked-Prisma unit spec (checklist-session.service.spec.ts) covers every transition branch;
// this file exists specifically to prove the one claim a mock can't verify: that two concurrent
// requests racing to transition the same session cannot both win (docs/architecture/adr/
// ADR_CHECKLIST_SESSION_OVERLAY.md's "terminal actions race-safe" criterion).
describe('checklist session lifecycle — database', () => {
  let prisma: PrismaService;
  let service: ChecklistSessionService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let instanceId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ChecklistSessionService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist session lifecycle ${runId}`, slug: `checklist-session-lifecycle-${runId}` },
    });
    organizationId = organization.id;

    const learner = await prisma.user.create({
      data: {
        organizationId,
        email: `learner-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Session',
        lastName: 'Learner',
      },
    });
    learnerId = learner.id;

    const observer = await prisma.user.create({
      data: {
        organizationId,
        email: `observer-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Session',
        lastName: 'Observer',
      },
    });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Session checklist', status: 'published' },
    });
    const instance = await prisma.checklistInstance.create({
      data: { organizationId, checklistId: checklist.id, userId: learnerId },
    });
    instanceId = instance.id;
  });

  afterEach(async () => {
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('rejects an observer without the instructor role', async () => {
    const learnerAsObserver = learnerId;
    await expect(
      service.create(organizationId, { instanceId, observerId: learnerAsObserver }, observerId),
    ).rejects.toThrow('Observer must be a user with the instructor role');
  });

  it('runs the full documented lifecycle: scheduled -> in_progress -> paused -> in_progress -> completed', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    expect(created.status).toBe('scheduled');
    expect(created.version).toBe(1);

    const started = await service.transition(created.id, organizationId, 'start', 1, observerId, {});
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();
    expect(started.version).toBe(2);

    const paused = await service.transition(created.id, organizationId, 'pause', 2, observerId, {});
    expect(paused.status).toBe('paused');
    expect(paused.pausedAt).not.toBeNull();

    const resumed = await service.transition(created.id, organizationId, 'resume', 3, observerId, {});
    expect(resumed.status).toBe('in_progress');
    expect(resumed.pausedAt).toBeNull();

    const completed = await service.transition(created.id, organizationId, 'complete', 4, observerId, {});
    expect(completed.status).toBe('completed');

    const events = await prisma.checklistSessionEvent.findMany({
      where: { sessionId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.eventType)).toEqual(['created', 'started', 'paused', 'resumed', 'completed']);
  });

  it('allows cancel only from scheduled', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});

    await expect(service.transition(created.id, organizationId, 'cancel', 2, observerId, {})).rejects.toThrow(
      /Cannot cancel a session in status "in_progress"/,
    );
  });

  it('rejects a stale write with a conflict once the version has moved on', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});

    // The session is now in_progress (version 2). Retrying "pause" — a transition that's valid
    // from in_progress — with the stale version 1 must be rejected as a conflict, not silently
    // re-applied and not confused with the (also-true-here) "wrong status" case.
    await expect(service.transition(created.id, organizationId, 'pause', 1, observerId, {})).rejects.toThrow(
      'Checklist session was modified by someone else — reload and try again',
    );
  });

  it('is race-safe: of two concurrent "start" requests for the same session, exactly one wins', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    const results = await Promise.allSettled([
      service.transition(created.id, organizationId, 'start', 1, observerId, {}),
      service.transition(created.id, organizationId, 'start', 1, observerId, {}),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const final = await prisma.checklistSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(final.status).toBe('in_progress');
    expect(final.version).toBe(2);

    // Exactly one "started" event, not two — the loser never got to record its event.
    const startedEvents = await prisma.checklistSessionEvent.findMany({
      where: { sessionId: created.id, eventType: 'started' },
    });
    expect(startedEvents).toHaveLength(1);
  });

  it('is race-safe across two different terminal actions racing on the same in-progress session', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});

    const results = await Promise.allSettled([
      service.transition(created.id, organizationId, 'pause', 2, observerId, {}),
      service.transition(created.id, organizationId, 'complete', 2, observerId, {}),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const final = await prisma.checklistSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(['paused', 'completed']).toContain(final.status);
    expect(final.version).toBe(3);
  });
});
