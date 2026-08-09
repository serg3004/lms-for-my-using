import { Global, Module } from '@nestjs/common';

import { BACKGROUND_JOB_BACKEND } from './background-job.backend.js';
import { BackgroundJobsService } from './background-jobs.service.js';
import { BullMqBackgroundJobBackend } from './bullmq-background-job.backend.js';
import { DisabledBackgroundJobBackend } from './disabled-background-job.backend.js';

@Global()
@Module({
  providers: [
    {
      provide: BACKGROUND_JOB_BACKEND,
      useFactory: () => process.env['REDIS_URL']
        ? new BullMqBackgroundJobBackend(process.env['REDIS_URL'])
        : new DisabledBackgroundJobBackend(),
    },
    BackgroundJobsService,
  ],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule {}
