import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
