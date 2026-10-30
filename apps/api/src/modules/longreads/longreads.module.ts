import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LongreadVersionsService } from './longread-versions.service.js';
import { LongreadsController } from './longreads.controller.js';
import { LongreadsService } from './longreads.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LongreadsController],
  providers: [LongreadsService, LongreadVersionsService],
  exports: [LongreadsService],
})
export class LongreadsModule {}
