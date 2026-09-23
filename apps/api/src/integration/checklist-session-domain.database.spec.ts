/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// Exercises the schema-level invariants PR 288 adds for the workplace-training ChecklistSession
// domain (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md). No service/API layer exists
// yet (PR 289+), so this operates on PrismaService directly, same as the other *.database.spec.ts
// files that verify constraints before a service consumes them.
describe('checklist session domain — database', () => {
  let prisma: PrismaService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let checklistId: string;
  let itemId: string;
  let instanceId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist session domain ${runId}`, slug: `checklist-session-domain-${runId}` },
    });
    organizationId = organization.id;

    const [learner, observer] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          email: `learner-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Session',
          lastName: 'Learner',
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          email: `observer-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Session',
          lastName: 'Observer',
        },
      }),
    ]);
    learnerId = learner.id;
    observerId = observer.id;

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Session checklist', status: 'published' },
    });
    checklistId = checklist.id;

    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Item', points: 10 },
    });
    itemId = item.id;

    const instance = await prisma.checklistInstance.create({
      data: { organizationId, checklistId, userId: learnerId },
    });
    instanceId = instance.id;
  });

  afterEach(async () => {
    await prisma.checklistLocationCapture.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionReminder.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistScoreRevision.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistScaleLevel.deleteMany({ where: { organizationId } });
    await prisma.checklistScale.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('creates a session as a 1:1 overlay with the documented safe defaults', async () => {
    const session = await prisma.checklistSession.create({
      data: { organizationId, instanceId, observerId },
    });

    expect(session.status).toBe('scheduled');
    expect(session.version).toBe(1);
    expect(session.locationCapturePolicy).toBe('off');
    expect(session.timezone).toBe('Asia/Almaty');
    expect(session.scheduledAt).toBeNull();
    expect(session.startedAt).toBeNull();
    expect(session.pausedAt).toBeNull();
  });

  it('rejects a second session on the same instance (unique instanceId — true 1:1 overlay)', async () => {
    await prisma.checklistSession.create({ data: { organizationId, instanceId, observerId } });

    await expect(
      prisma.checklistSession.create({ data: { organizationId, instanceId, observerId } }),
    ).rejects.toThrow();
  });

  it('cascades: deleting the ChecklistInstance deletes its ChecklistSession and every nested child', async () => {
    const session = await prisma.checklistSession.create({
      data: { organizationId, instanceId, observerId, status: 'in_progress' },
    });
    await prisma.checklistSessionEvent.create({
      data: { organizationId, sessionId: session.id, eventType: 'started', actorUserId: observerId },
    });
    await prisma.checklistSessionReminder.create({
      data: {
        organizationId,
        sessionId: session.id,
        reminderType: 'pre_start',
        scheduledFor: new Date(),
      },
    });
    await prisma.checklistLocationCapture.create({
      data: {
        organizationId,
        sessionId: session.id,
        capturePoint: 'start',
        status: 'captured',
        latitude: 51.1,
        longitude: 71.4,
      },
    });

    await prisma.checklistInstance.delete({ where: { id: instanceId } });

    await expect(prisma.checklistSession.findUnique({ where: { id: session.id } })).resolves.toBeNull();
    await expect(prisma.checklistSessionEvent.findMany({ where: { sessionId: session.id } })).resolves.toEqual([]);
    await expect(prisma.checklistSessionReminder.findMany({ where: { sessionId: session.id } })).resolves.toEqual([]);
    await expect(prisma.checklistLocationCapture.findMany({ where: { sessionId: session.id } })).resolves.toEqual([]);
  });

  it('enforces "start/end only" geolocation capture at the database level (unique sessionId+capturePoint)', async () => {
    const session = await prisma.checklistSession.create({ data: { organizationId, instanceId, observerId } });
    await prisma.checklistLocationCapture.create({
      data: { organizationId, sessionId: session.id, capturePoint: 'start', status: 'captured', latitude: 1, longitude: 1 },
    });

    await expect(
      prisma.checklistLocationCapture.create({
        data: { organizationId, sessionId: session.id, capturePoint: 'start', status: 'captured', latitude: 2, longitude: 2 },
      }),
    ).rejects.toThrow();

    // The other capture point is still allowed — "start/end only" means at most one of each, not one total.
    await expect(
      prisma.checklistLocationCapture.create({
        data: { organizationId, sessionId: session.id, capturePoint: 'end', status: 'captured', latitude: 2, longitude: 2 },
      }),
    ).resolves.toMatchObject({ capturePoint: 'end' });
  });

  it('enforces at most one reminder per (session, reminderType) at the database level', async () => {
    const session = await prisma.checklistSession.create({ data: { organizationId, instanceId, observerId } });
    await prisma.checklistSessionReminder.create({
      data: { organizationId, sessionId: session.id, reminderType: 'pre_start', scheduledFor: new Date() },
    });

    await expect(
      prisma.checklistSessionReminder.create({
        data: { organizationId, sessionId: session.id, reminderType: 'pre_start', scheduledFor: new Date() },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate scale level value within the same scale', async () => {
    const scale = await prisma.checklistScale.create({ data: { organizationId, name: 'Performance scale' } });
    await prisma.checklistScaleLevel.create({
      data: { organizationId, scaleId: scale.id, value: 1, label: 'Poor', score: 0 },
    });

    await expect(
      prisma.checklistScaleLevel.create({
        data: { organizationId, scaleId: scale.id, value: 1, label: 'Duplicate', score: 10 },
      }),
    ).rejects.toThrow();
  });

  it('adds session-criteria config to ChecklistItem without disturbing existing fields', async () => {
    const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: itemId } });

    expect(item.weight).toBe(1);
    expect(item.allowSkip).toBe(false);
    expect(item.autoSkipUnanswered).toBe(false);
    expect(item.isRequired).toBe(true);
    expect(item.photoRequired).toBe(false);
  });

  it('records a score revision without duplicating ChecklistInstance fields it audits', async () => {
    const revision = await prisma.checklistScoreRevision.create({
      data: {
        organizationId,
        instanceId,
        previousPercentage: 60,
        newPercentage: 80,
        previousPassed: false,
        newPassed: true,
        reason: 'Corrected a mis-scored item',
        actorUserId: observerId,
      },
    });

    expect(revision.previousPercentage).toBe(60);
    expect(revision.newPercentage).toBe(80);
    // ChecklistInstance itself is untouched by creating a revision — it stays the single source
    // of the *current* score; the revision is only a before/after audit row.
    const instance = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(instance.percentage).toBe(0);
  });
});
