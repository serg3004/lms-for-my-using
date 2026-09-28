/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 297: structured feedback (strengths/development areas/next steps) against a real Postgres
// instance -- specifically the "not before started" gate and the same version/409 optimistic-
// concurrency contract used everywhere else on ChecklistSession.
describe('checklist session structured feedback — database', () => {
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
      data: { name: `Checklist session feedback ${runId}`, slug: `checklist-session-feedback-${runId}` },
    });
    organizationId = organization.id;

    const learner = await prisma.user.create({
      data: {
        organizationId,
        email: `learner-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Feedback',
        lastName: 'Learner',
      },
    });
    learnerId = learner.id;

    const observer = await prisma.user.create({
      data: {
        organizationId,
        email: `observer-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Feedback',
        lastName: 'Observer',
      },
    });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Feedback checklist', status: 'published' },
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

  it('rejects feedback on a session that has not started yet', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);

    await expect(
      service.submitFeedback(created.id, organizationId, { strengths: 'Great start', version: 1 }, observerId, {}),
    ).rejects.toThrow('Cannot record feedback for a session in status "scheduled"');
  });

  it('rejects feedback on a cancelled session', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'cancel', 1, observerId, {});

    await expect(
      service.submitFeedback(created.id, organizationId, { nextSteps: 'Retry later', version: 2 }, observerId, {}),
    ).rejects.toThrow('Cannot record feedback for a session in status "cancelled"');
  });

  it('saves partial feedback while in progress and allows incremental updates (autosave)', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});

    const afterFirst = await service.submitFeedback(
      created.id,
      organizationId,
      { strengths: 'Followed the safety checklist precisely', version: 2 },
      observerId,
      {},
    );
    expect(afterFirst.strengths).toBe('Followed the safety checklist precisely');
    expect(afterFirst.developmentAreas).toBeNull();
    expect(afterFirst.nextSteps).toBeNull();
    expect(afterFirst.version).toBe(3);

    const afterSecond = await service.submitFeedback(
      created.id,
      organizationId,
      { developmentAreas: 'Needs more practice with the torque wrench', nextSteps: 'Schedule a follow-up session', version: 3 },
      observerId,
      {},
    );
    expect(afterSecond.strengths).toBe('Followed the safety checklist precisely');
    expect(afterSecond.developmentAreas).toBe('Needs more practice with the torque wrench');
    expect(afterSecond.nextSteps).toBe('Schedule a follow-up session');
    expect(afterSecond.version).toBe(4);

    const events = await prisma.checklistSessionEvent.findMany({
      where: { sessionId: created.id, eventType: 'feedback_updated' },
    });
    expect(events).toHaveLength(2);
  });

  it('keeps feedback editable after completion', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});
    await service.transition(created.id, organizationId, 'complete', 2, observerId, {});

    const afterFeedback = await service.submitFeedback(
      created.id,
      organizationId,
      { strengths: 'Confident and thorough', version: 3 },
      observerId,
      {},
    );
    expect(afterFeedback.status).toBe('completed');
    expect(afterFeedback.strengths).toBe('Confident and thorough');
  });

  it('rejects a stale write with a conflict once the version has moved on', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});
    await service.submitFeedback(created.id, organizationId, { strengths: 'First note', version: 2 }, observerId, {});

    await expect(
      service.submitFeedback(created.id, organizationId, { strengths: 'Retry with stale version', version: 2 }, observerId, {}),
    ).rejects.toThrow('Checklist session was modified by someone else — reload and try again');
  });

  it('clears a field by submitting null', async () => {
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    await service.transition(created.id, organizationId, 'start', 1, observerId, {});
    await service.submitFeedback(created.id, organizationId, { strengths: 'Initial note', version: 2 }, observerId, {});

    const cleared = await service.submitFeedback(created.id, organizationId, { strengths: null, version: 3 }, observerId, {});
    expect(cleared.strengths).toBeNull();
  });

  it('persists snapshotted context values and enforces required fields at completion', async () => {
    const fieldId = randomUUID();
    await prisma.checklist.update({
      where: { id: (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).checklistId },
      data: { contextFields: [{ id: fieldId, label: 'Store number', type: 'text', required: true, order: 0 }] },
    });
    const created = await service.create(organizationId, { instanceId, observerId }, observerId);
    const started = await service.transition(created.id, organizationId, 'start', 1, observerId, {});

    await expect(service.transition(created.id, organizationId, 'complete', started.version, observerId, {}))
      .rejects.toThrow('Required context field is missing: Store number');

    const saved = await service.submitContext(
      created.id,
      organizationId,
      { values: { [fieldId]: 'A-12' }, version: started.version },
      {},
    );
    expect(saved.contextValues).toEqual({ [fieldId]: 'A-12' });
    await expect(service.submitContext(created.id, organizationId, { values: { [fieldId]: 'stale' }, version: started.version }, {}))
      .rejects.toThrow('Checklist session was modified by someone else — reload and try again');

    await prisma.checklist.update({
      where: { id: (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).checklistId },
      data: { contextFields: [{ id: randomUUID(), label: 'Changed later', type: 'text', required: false, order: 0 }] },
    });
    const completed = await service.transition(created.id, organizationId, 'complete', saved.version, observerId, {});
    expect(completed.status).toBe('completed');
    expect(completed.contextFieldsSnapshot).toEqual([{ id: fieldId, label: 'Store number', type: 'text', required: true, order: 0 }]);
  });
});
