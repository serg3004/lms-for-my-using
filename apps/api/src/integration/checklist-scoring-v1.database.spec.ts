/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 290 acceptance criteria, verified against real Postgres rather than a mocked Prisma:
// - skipped items are excluded from both numerator and denominator;
// - an all-skipped instance is not_scored, never a misleading 0%;
// - the "start/end only" geolocation-capture constraint is enforced through the service layer,
//   not just the raw DB constraint (already covered separately for the raw constraint in
//   checklist-session-domain.database.spec.ts, PR 288).
describe('checklist scoring v1 (skip/weight/geolocation) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let checklistId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist scoring v1 ${runId}`, slug: `checklist-scoring-v1-${runId}` },
    });
    organizationId = organization.id;

    const [learner, observer] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          email: `learner-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Scoring',
          lastName: 'Learner',
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          email: `observer-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Scoring',
          lastName: 'Observer',
        },
      }),
    ]);
    learnerId = learner.id;
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const checklist = await prisma.checklist.create({
      data: {
        organizationId,
        title: 'Scoring v1 checklist',
        status: 'published',
        scoringMode: 'sum_points',
        passThreshold: 50,
        requiresReview: false,
      },
    });
    checklistId = checklist.id;
  });

  afterEach(async () => {
    await prisma.checklistLocationCapture.deleteMany({ where: { organizationId } });
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

  it('excludes a skipped item from both numerator and denominator, and marks all-skipped not_scored', async () => {
    const itemA = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'A', points: 10, isRequired: true, allowSkip: true },
    });
    const itemB = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 1, text: 'B', points: 10, isRequired: true, allowSkip: true },
    });

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);

    await checklistsService.skipItem(instance.id, itemA.id, organizationId, learnerId, false, {});
    const afterFirstAnswer = await checklistsService.submitItemResult(instance.id, itemB.id, organizationId, learnerId, false, { checked: true });

    // Item A is excluded entirely -- 10/10 from item B, not 10/20.
    expect(afterFirstAnswer.percentage).toBe(100);
    expect(afterFirstAnswer.scored).toBe(true);
    expect(afterFirstAnswer.status).toBe('completed');

    // A second, separate instance covers the all-skipped case: the first instance is already
    // completed and no longer editable (correct, pre-existing behavior), so this needs its own.
    const secondLearner = await prisma.user.create({
      data: {
        organizationId,
        email: `learner-2-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Scoring',
        lastName: 'LearnerTwo',
      },
    });
    const secondInstance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: secondLearner.id }, observerId);
    await checklistsService.skipItem(secondInstance.id, itemA.id, organizationId, secondLearner.id, false, {});
    const bothSkipped = await checklistsService.skipItem(secondInstance.id, itemB.id, organizationId, secondLearner.id, false, {});

    expect(bothSkipped.scored).toBe(false);
    expect(bothSkipped.percentage).toBe(0);
    expect(bothSkipped.passed).toBe(false);

    const stored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: secondInstance.id } });
    expect(stored.scored).toBe(false);
  });

  it('applies per-item weight and auto-skips an unanswered item, both persisted for audit', async () => {
    const heavy = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Heavy', points: 10, isRequired: true, weight: 3 },
    });
    const optional = await prisma.checklistItem.create({
      data: {
        organizationId,
        checklistId,
        order: 1,
        text: 'Optional',
        points: 10,
        isRequired: true,
        allowSkip: true,
        autoSkipUnanswered: true,
      },
    });

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    // heavy: weight 3, checked -> earns 30, contributes 30 to max; optional never answered -> auto-skipped.
    const result = await checklistsService.submitItemResult(instance.id, heavy.id, organizationId, learnerId, false, { checked: true });

    expect(result.percentage).toBe(100);
    expect(result.status).toBe('completed');

    const optionalResult = await prisma.checklistItemResult.findUniqueOrThrow({
      where: { instanceId_itemId: { instanceId: instance.id, itemId: optional.id } },
    });
    expect(optionalResult.answerState).toBe('skipped');
  });

  it('geolocation: at most one capture per (session, point) through the service layer -- a duplicate is a 409', async () => {
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    const session = await sessionService.create(
      organizationId,
      { instanceId: instance.id, observerId, locationCapturePolicy: 'required' },
      observerId,
    );

    await sessionService.captureLocation(
      session.id,
      organizationId,
      'start',
      { status: 'captured', latitude: 51.1, longitude: 71.4 },
      observerId,
      {},
    );

    await expect(
      sessionService.captureLocation(
        session.id,
        organizationId,
        'start',
        { status: 'captured', latitude: 51.2, longitude: 71.5 },
        observerId,
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // The other capture point is still independently allowed.
    await expect(
      sessionService.captureLocation(
        session.id,
        organizationId,
        'end',
        { status: 'captured', latitude: 51.2, longitude: 71.5 },
        observerId,
        {},
      ),
    ).resolves.toMatchObject({ capturePoint: 'end' });

    const captures = await prisma.checklistLocationCapture.findMany({ where: { sessionId: session.id } });
    expect(captures).toHaveLength(2);
  });

  it('geolocation: an admin override on a required-policy session is audited with a location_override event', async () => {
    const admin = await prisma.user.create({
      data: {
        organizationId,
        email: `admin-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Scoring',
        lastName: 'Admin',
      },
    });

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    const session = await sessionService.create(
      organizationId,
      { instanceId: instance.id, observerId, locationCapturePolicy: 'required' },
      observerId,
    );

    await sessionService.captureLocation(
      session.id,
      organizationId,
      'start',
      { status: 'unavailable', overrideReason: 'Observer device offline; admin confirmed on-site by phone' },
      admin.id,
      {},
    );

    const events = await prisma.checklistSessionEvent.findMany({ where: { sessionId: session.id, eventType: 'location_override' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ capturePoint: 'start', overrideReason: expect.stringContaining('Observer device offline') });
  });
});
