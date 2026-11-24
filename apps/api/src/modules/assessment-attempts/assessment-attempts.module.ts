import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentAttemptsController } from './assessment-attempts.controller.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';
import { AssessmentResultsService } from './assessment-results.service.js';

import { AssessmentsModule } from '../assessments/public.js';
import { BackgroundJobsModule } from '../background-jobs/public.js';

import { AssessmentManualReviewService } from './assessment-manual-review.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, AssessmentsModule, BackgroundJobsModule],
  controllers: [AssessmentAttemptsController],
  providers: [AssessmentManualReviewService, AssessmentAttemptsService, AssessmentResultsService],
})
export class AssessmentAttemptsModule {}
