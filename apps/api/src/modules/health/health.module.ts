import { Module } from '@nestjs/common';

import { UploadModule } from '../upload/upload.module.js';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module.js';
import { DatabaseHealthService } from './database-health.service.js';
import { HealthController } from './health.controller.js';
import { RedisHealthService } from './redis-health.service.js';

@Module({
  imports: [UploadModule, BackgroundJobsModule],
  controllers: [HealthController],
  providers: [DatabaseHealthService, RedisHealthService],
})
export class HealthModule {}
