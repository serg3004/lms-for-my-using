import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LongreadsController } from './longreads.controller.js';
import { LongreadsService } from './longreads.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LongreadsController],
  providers: [LongreadsService],
  exports: [LongreadsService],
})
export class LongreadsModule {}
