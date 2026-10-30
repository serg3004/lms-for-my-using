import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LongreadsModule } from '../longreads/public.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  imports: [AuthModule, LongreadsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
