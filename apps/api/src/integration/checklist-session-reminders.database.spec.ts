/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { BackgroundJobsService } from '../modules/background-jobs/public.js';
import { DisabledBackgroundJobBackend } from '../modules/background-jobs/disabled-background-job.backend.js';
import { ChecklistSessionReminderDelivery } from '../modules/checklists/checklist-session-reminder-delivery.js';
import { ChecklistSessionReminderWorker } from '../modules/checklists/checklist-session-reminder.worker.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OutboxService } from '../modules/outbox/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 291 acceptance criteria, verified against real Postgres and the actual worker logic (not a
// mock): a due reminder is really processed by ChecklistSessionReminderWorker.processDue(), a
// terminal session never gets a reminder sent, a concurrent double-run of the worker never
// double-sends (DB-level idempotency, not just queue dedupe), and an unconfigured email delivery
// endpoint never breaks the workflow.
describe('checklist session reminders — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let worker: ChecklistSessionReminderWorker;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let checklistId: string;
  let instanceId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma);
    const backgroundJobs = new BackgroundJobsService(new DisabledBackgroundJobBackend());
    const outbox = new OutboxService(prisma, backgroundJobs);
    // No CHECKLIST_SESSION_REMINDER_DELIVERY_URL is set in this test environment -- exercises the
    // real "email only at production capability" no-op path, not a mocked one.
    const delivery = new ChecklistSessionReminderDelivery();
    worker = new ChecklistSessionReminderWorker(prisma, backgroundJobs, outbox, delivery);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist session reminders ${runId}`, slug: `checklist-session-reminders-${runId}` },
    });
    organizationId = organization.id;

    const [learner, observer] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          email: `learner-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Reminder',
          lastName: 'Learner',
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          email: `observer-${runId}@example.test`,
          passwordHash: 'not-used-by-this-test',
          firstName: 'Reminder',
          lastName: 'Observer',
        },
      }),
    ]);
    learnerId = learner.id;
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Reminder checklist', status: 'published' },
    });
    checklistId = checklist.id;

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, observerId);
    instanceId = instance.id;
  });

  afterEach(async () => {
    await prisma.checklistSessionReminder.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: {} });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('creates a due pre_start reminder on session create and the worker really sends it', async () => {
    const now = new Date();
    // scheduledAt = now, so scheduledFor (scheduledAt - 24h) is already well in the past.
    const session = await sessionService.create(organizationId, { instanceId, observerId, scheduledAt: now.toISOString() }, observerId);

    const reminder = await prisma.checklistSessionReminder.findUniqueOrThrow({
      where: { sessionId_reminderType: { sessionId: session.id, reminderType: 'pre_start' } },
    });
    expect(reminder.status).toBe('pending');
    expect(reminder.scheduledFor.getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000);

    const sent = await worker.processDue(now);
    expect(sent).toBe(1);

    const updatedReminder = await prisma.checklistSessionReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(updatedReminder.status).toBe('sent');
    expect(updatedReminder.sentAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { organizationId, userId: observerId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('checklist_session_pre_start_reminder');

    const events = await prisma.checklistSessionEvent.findMany({ where: { sessionId: session.id, eventType: 'reminder_sent' } });
    expect(events).toHaveLength(1);

    // The email-delivery outbox event was written in the same transaction, even though no
    // delivery URL is configured -- confirms the workflow doesn't skip it, only the HTTP call.
    const outboxEvents = await prisma.outboxEvent.findMany({ where: { topic: 'checklists.session-reminder-notify' } });
    expect(outboxEvents).toHaveLength(1);
  });

  it('schedules and fires a pre_start reminder for a session that spans a real DST transition (PR 303)', async () => {
    // 2026-03-08 07:00 UTC = 2026-03-08 03:00 EDT, just after the US spring-forward transition
    // (clocks jumped 2:00 AM -> 3:00 AM). The session's own `timezone` field is display-only
    // (ADR/PR 303) -- scheduling math here works entirely in UTC instants, so this asserts the
    // real worker/DB path never drifts by the "missing" hour a naive local-calendar calculation
    // would introduce.
    const scheduledAt = new Date('2026-03-08T07:00:00.000Z');
    const session = await sessionService.create(
      organizationId,
      { instanceId, observerId, scheduledAt: scheduledAt.toISOString(), timezone: 'America/New_York' },
      observerId,
    );

    const reminder = await prisma.checklistSessionReminder.findUniqueOrThrow({
      where: { sessionId_reminderType: { sessionId: session.id, reminderType: 'pre_start' } },
    });
    expect(reminder.scheduledFor.getTime()).toBe(scheduledAt.getTime() - 24 * 60 * 60 * 1000);

    // Not yet due one second before the computed instant...
    const sentBefore = await worker.processDue(new Date(reminder.scheduledFor.getTime() - 1000));
    expect(sentBefore).toBe(0);

    // ...but due exactly at (or after) the computed instant, 24 real hours before the session,
    // regardless of the DST transition sitting between the reminder and the session itself.
    const sentAt = await worker.processDue(new Date(reminder.scheduledFor.getTime()));
    expect(sentAt).toBe(1);
  });

  it('creates an incomplete_after_start reminder on start and suppresses it on complete, end to end', async () => {
    const session = await sessionService.create(organizationId, { instanceId, observerId }, observerId);
    const started = await sessionService.transition(session.id, organizationId, 'start', 1, observerId, {});

    const reminder = await prisma.checklistSessionReminder.findUniqueOrThrow({
      where: { sessionId_reminderType: { sessionId: session.id, reminderType: 'incomplete_after_start' } },
    });
    expect(reminder.status).toBe('pending');
    expect(reminder.scheduledFor.getTime()).toBe(started.startedAt!.getTime() + 24 * 60 * 60 * 1000);

    await sessionService.transition(session.id, organizationId, 'complete', 2, observerId, {});

    const suppressed = await prisma.checklistSessionReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(suppressed.status).toBe('suppressed');

    // Even if it were somehow still due, the worker would never send it now.
    const sent = await worker.processDue(new Date(reminder.scheduledFor.getTime() + 1000));
    expect(sent).toBe(0);
  });

  it('never sends a reminder for a terminal session, even if the row is still pending (defensive worker-side check)', async () => {
    const now = new Date();
    const session = await sessionService.create(organizationId, { instanceId, observerId, scheduledAt: now.toISOString() }, observerId);
    // Bypass the service layer's own suppression-on-cancel to exercise the worker's own
    // belt-and-suspenders terminal check directly: force the session terminal while the reminder
    // row is left pending.
    await prisma.checklistSession.update({ where: { id: session.id }, data: { status: 'cancelled' } });

    const sent = await worker.processDue(now);
    expect(sent).toBe(0);

    const reminder = await prisma.checklistSessionReminder.findUniqueOrThrow({
      where: { sessionId_reminderType: { sessionId: session.id, reminderType: 'pre_start' } },
    });
    expect(reminder.status).toBe('suppressed');
    const notifications = await prisma.notification.findMany({ where: { organizationId, userId: observerId } });
    expect(notifications).toHaveLength(0);
  });

  it('is race-safe: two concurrent worker runs on the same due reminder never both send', async () => {
    const now = new Date();
    const session = await sessionService.create(organizationId, { instanceId, observerId, scheduledAt: now.toISOString() }, observerId);

    const [firstCount, secondCount] = await Promise.all([worker.processDue(now), worker.processDue(now)]);
    expect(firstCount + secondCount).toBe(1);

    const notifications = await prisma.notification.findMany({ where: { organizationId, userId: observerId } });
    expect(notifications).toHaveLength(1);
    const events = await prisma.checklistSessionEvent.findMany({ where: { sessionId: session.id, eventType: 'reminder_sent' } });
    expect(events).toHaveLength(1);
  });

  it('does not send a reminder that is not yet due', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sessionService.create(organizationId, { instanceId, observerId, scheduledAt: farFuture.toISOString() }, observerId);

    const sent = await worker.processDue(new Date());
    expect(sent).toBe(0);
  });

  it('moves the pre_start reminder forward when the session is rescheduled, and it is not (yet) due at the old time', async () => {
    const now = new Date();
    const session = await sessionService.create(organizationId, { instanceId, observerId, scheduledAt: now.toISOString() }, observerId);
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await sessionService.update(session.id, organizationId, { version: 1, scheduledAt: farFuture.toISOString() }, observerId, {});

    const reminder = await prisma.checklistSessionReminder.findUniqueOrThrow({
      where: { sessionId_reminderType: { sessionId: session.id, reminderType: 'pre_start' } },
    });
    expect(reminder.status).toBe('pending');
    expect(reminder.scheduledFor.getTime()).toBe(farFuture.getTime() - 24 * 60 * 60 * 1000);

    const sent = await worker.processDue(now);
    expect(sent).toBe(0);
  });
});
