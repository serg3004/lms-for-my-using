import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import type { BackgroundJob } from '../background-jobs/public.js';
import { OutboxService } from '../outbox/public.js';
import { ChecklistSessionReminderDelivery } from './checklist-session-reminder-delivery.js';

export const CHECKLIST_SESSION_REMINDER_JOB = 'checklists.session-reminders-due';
export const CHECKLIST_SESSION_REMINDER_SCHEDULER = 'checklists-session-reminders-due-v1';
export const CHECKLIST_SESSION_REMINDER_INTERVAL_MS = 60_000;
export const CHECKLIST_SESSION_REMINDER_BATCH_SIZE = 100;
export const CHECKLIST_SESSION_REMINDER_NOTIFY_JOB = 'checklists.session-reminder-notify';

type DueReminder = {
  id: string;
  organizationId: string;
  sessionId: string;
  reminderType: 'pre_start' | 'incomplete_after_start';
};

const TERMINAL_SESSION_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Recurring worker for ChecklistSession reminders (PR 291), a sibling of
 * ChecklistDeadlineWorker (`checklist-deadline.worker.ts`) using the exact same
 * BackgroundJobsService.registerHandler/registerRecurring pattern, but on a distinct job name and
 * scheduler id -- these coexist as two independent recurring jobs, one for overdue
 * ChecklistInstance expiry, one for ChecklistSession reminders.
 *
 * Business idempotency lives in the database, not just in the job queue's own dedupe: each
 * ChecklistSessionReminder row can only ever transition pending -> sent once (a conditional
 * `updateMany(... WHERE status = 'pending')`, count !== 1 means a concurrent run already claimed
 * it), independent of and in addition to the queue's own retry/backoff.
 */
@Injectable()
export class ChecklistSessionReminderWorker implements OnModuleInit {
  private readonly logger = new Logger(ChecklistSessionReminderWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobs: BackgroundJobsService,
    private readonly outbox: OutboxService,
    private readonly delivery: ChecklistSessionReminderDelivery,
  ) {}

  onModuleInit() {
    this.backgroundJobs.registerHandler(CHECKLIST_SESSION_REMINDER_JOB, async () => {
      await this.processDue();
    });
    this.backgroundJobs.registerRecurring(
      CHECKLIST_SESSION_REMINDER_JOB,
      {},
      {
        schedulerId: CHECKLIST_SESSION_REMINDER_SCHEDULER,
        everyMs: CHECKLIST_SESSION_REMINDER_INTERVAL_MS,
        attempts: 3,
        backoffMs: 1_000,
      },
    );
    this.backgroundJobs.registerHandler(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB, async (job) => {
      await this.deliverEmail(job);
    });
  }

  async processDue(now = new Date()): Promise<number> {
    let totalSent = 0;
    while (true) {
      const batch = await this.processDueBatch(now, CHECKLIST_SESSION_REMINDER_BATCH_SIZE);
      totalSent += batch.sent;
      if (batch.selected < CHECKLIST_SESSION_REMINDER_BATCH_SIZE) break;
    }
    return totalSent;
  }

  private async processDueBatch(now: Date, limit: number) {
    const due = await this.prisma.checklistSessionReminder.findMany({
      where: { status: 'pending', scheduledFor: { lte: now } },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, organizationId: true, sessionId: true, reminderType: true },
    });

    let sent = 0;
    for (const reminder of due as DueReminder[]) {
      const handled = await this.processOne(reminder, now);
      if (handled) sent++;
    }
    return { selected: due.length, sent };
  }

  private async processOne(reminder: DueReminder, now: Date): Promise<boolean> {
    const session = await this.prisma.checklistSession.findUnique({
      where: { id: reminder.sessionId },
      select: { id: true, observerId: true, status: true },
    });

    // No session (cascade-deleted -- shouldn't normally race with a pending reminder, but this
    // guards it) or a terminal session: suppress rather than send. Never a silent drop -- the row
    // still records that this reminder was resolved, just not by sending.
    if (!session || TERMINAL_SESSION_STATUSES.has(session.status)) {
      await this.prisma.checklistSessionReminder.updateMany({
        where: { id: reminder.id, status: 'pending' },
        data: { status: 'suppressed' },
      });
      return false;
    }

    return this.outbox.runInTransaction(async (tx, emit) => {
      const claimed = await tx.checklistSessionReminder.updateMany({
        where: { id: reminder.id, status: 'pending' },
        data: { status: 'sent', sentAt: now },
      });
      // A concurrent run (retry, or an overlapping worker tick) already claimed this reminder --
      // the DB-level guard, not the queue, is what makes this idempotent.
      if (claimed.count !== 1) return false;

      await tx.checklistSessionEvent.create({
        data: {
          organizationId: reminder.organizationId,
          sessionId: reminder.sessionId,
          eventType: 'reminder_sent',
          metadata: { reminderType: reminder.reminderType },
        },
      });

      await tx.notification.create({
        data: {
          organizationId: reminder.organizationId,
          userId: session.observerId,
          type:
            reminder.reminderType === 'pre_start'
              ? 'checklist_session_pre_start_reminder'
              : 'checklist_session_incomplete_after_start_reminder',
          data: { sessionId: reminder.sessionId },
          link: `/instructor/checklists/sessions/${reminder.sessionId}`,
        },
      });

      // Email delivery is a separate, async, best-effort side effect -- the in-app Notification
      // above is already durable by the time this transaction commits, so an unconfigured or
      // failing email provider never blocks or undoes the reminder itself.
      await emit({
        topic: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB,
        payload: {
          reminderId: reminder.id,
          sessionId: reminder.sessionId,
          organizationId: reminder.organizationId,
          observerId: session.observerId,
          reminderType: reminder.reminderType,
        },
      });

      return true;
    });
  }

  private async deliverEmail(job: BackgroundJob) {
    const { organizationId, sessionId, observerId, reminderType } = job.data;
    if (
      typeof organizationId !== 'string' ||
      typeof sessionId !== 'string' ||
      typeof observerId !== 'string' ||
      (reminderType !== 'pre_start' && reminderType !== 'incomplete_after_start')
    ) {
      this.logger.warn('Dropping malformed checklist session reminder notify payload');
      return;
    }
    await this.delivery.send({ organizationId, sessionId, observerId, reminderType });
  }
}
