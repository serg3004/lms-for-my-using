import { Module } from '@nestjs/common';

import { UploadModule } from '../upload/upload.module.js';
import { HealthController } from './health.controller.js';
import { RedisHealthService } from './redis-health.service.js';

@Module({
  imports: [UploadModule],
  controllers: [HealthController],
  providers: [RedisHealthService],
})
export class HealthModule {}
