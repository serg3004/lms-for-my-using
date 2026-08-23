import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import { expireDueChecklistBatch } from './checklist-deadlines.js';

export const CHECKLIST_DEADLINE_JOB = 'checklists.expire-overdue';
export const CHECKLIST_DEADLINE_SCHEDULER = 'checklists-expire-overdue-v1';
export const CHECKLIST_DEADLINE_INTERVAL_MS = 60_000;
export const CHECKLIST_DEADLINE_BATCH_SIZE = 500;

@Injectable()
export class ChecklistDeadlineWorker implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobs: BackgroundJobsService,
  ) {}

  onModuleInit() {
    this.backgroundJobs.registerHandler(CHECKLIST_DEADLINE_JOB, async () => {
      await this.expireOverdue();
    });
    this.backgroundJobs.registerRecurring(
      CHECKLIST_DEADLINE_JOB,
      {},
      {
        schedulerId: CHECKLIST_DEADLINE_SCHEDULER,
        everyMs: CHECKLIST_DEADLINE_INTERVAL_MS,
        attempts: 3,
        backoffMs: 1_000,
      },
    );
  }

  async expireOverdue(now = new Date()) {
    let totalExpired = 0;
    while (true) {
      const batch = await expireDueChecklistBatch(this.prisma, now, CHECKLIST_DEADLINE_BATCH_SIZE);
      totalExpired += batch.expired;
      if (batch.selected < CHECKLIST_DEADLINE_BATCH_SIZE) break;
    }
    return totalExpired;
  }
}
