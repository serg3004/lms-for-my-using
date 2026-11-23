import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';

import { BackgroundJobsModule } from '../background-jobs/public.js';
import { StandaloneAssessmentsController } from './standalone-assessments.controller.js';
import { StandaloneAssessmentsService } from './standalone-assessments.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, BackgroundJobsModule],
  controllers: [StandaloneAssessmentsController, AssessmentsController],
  providers: [AssessmentsService, StandaloneAssessmentsService],
  exports: [StandaloneAssessmentsService],
})
export class AssessmentsModule {}
