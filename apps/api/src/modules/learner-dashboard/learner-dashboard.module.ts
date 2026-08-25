import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LearnerDashboardController } from './learner-dashboard.controller.js';
import { LearnerDashboardService } from './learner-dashboard.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [LearnerDashboardController],
  providers: [LearnerDashboardService],
})
export class LearnerDashboardModule {}
