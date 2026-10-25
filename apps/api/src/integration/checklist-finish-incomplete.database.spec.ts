/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 330, verified against real Postgres: `allowFinishIncomplete` is frozen into the instance
// snapshot at assignment, completing a session on such a checklist records every unanswered
// criterion as skipped (scoring v1 then leaves it out of numerator and denominator), and a
// checklist without the setting keeps its previous behaviour.
describe('checklist finish-incomplete setting (PR 330) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma, checklistsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Finish incomplete ${runId}`, slug: `finish-incomplete-${runId}` } })).id;
    learnerId = (await prisma.user.create({ data: { organizationId, email: `l-${runId}@example.test`, passwordHash: 'x', firstName: 'L', lastName: 'Learner' } })).id;
    observerId = (await prisma.user.create({ data: { organizationId, email: `o-${runId}@example.test`, passwordHash: 'x', firstName: 'O', lastName: 'Observer' } })).id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });
  });

  afterEach(async () => {
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

  async function startedSession(allowFinishIncomplete: boolean) {
    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Strictness', status: 'published', allowFinishIncomplete },
    });
    const items = await Promise.all(
      [1, 2, 3].map((order) =>
        prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order, text: `Criterion ${order}`, points: 10, isRequired: true } }),
      ),
    );
    const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
    const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    const started = await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
    return { checklist, items, instance, session: started };
  }

  it('skips every unanswered criterion on completion and scores only the answered one', async () => {
    const { items, instance, session } = await startedSession(true);
    await checklistsService.submitItemResult(instance.id, items[0]!.id, organizationId, learnerId, false, { checked: true });

    await sessionService.transition(session.id, organizationId, 'complete', session.version, observerId, {});

    const results = await prisma.checklistItemResult.findMany({ where: { instanceId: instance.id } });
    expect(results.find((r) => r.itemId === items[0]!.id)?.answerState).toBe('answered');
    expect(results.find((r) => r.itemId === items[1]!.id)?.answerState).toBe('skipped');
    expect(results.find((r) => r.itemId === items[2]!.id)?.answerState).toBe('skipped');
    const finished = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(finished.status).toBe('completed');
    // Skipped criteria leave both the numerator and the denominator: 10 of 10, not 10 of 30.
    expect([finished.totalScore, finished.maxScore, finished.percentage, finished.scored]).toEqual([10, 10, 100, true]);
  });

  it('is not undone by editing the checklist after assignment (the setting lives in the snapshot)', async () => {
    const { checklist, instance, session } = await startedSession(true);
    await prisma.checklist.update({ where: { id: checklist.id }, data: { allowFinishIncomplete: false } });

    await sessionService.transition(session.id, organizationId, 'complete', session.version, observerId, {});

    const skipped = await prisma.checklistItemResult.count({ where: { instanceId: instance.id, answerState: 'skipped' } });
    expect(skipped).toBe(3);
    const finished = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(finished.scored).toBe(false);
  });

  it('does not turn the setting on for an instance assigned while it was off', async () => {
    const { checklist, instance, session } = await startedSession(false);
    await prisma.checklist.update({ where: { id: checklist.id }, data: { allowFinishIncomplete: true } });

    await sessionService.transition(session.id, organizationId, 'complete', session.version, observerId, {});

    expect(await prisma.checklistItemResult.count({ where: { instanceId: instance.id, answerState: 'skipped' } })).toBe(0);
    const unfinished = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(unfinished.status).not.toBe('completed');
  });
});
