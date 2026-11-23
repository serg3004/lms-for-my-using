import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentAttemptsController } from './assessment-attempts.controller.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';
import { AssessmentResultsService } from './assessment-results.service.js';

import { AssessmentsModule } from '../assessments/public.js';

@Module({
  imports: [AuthModule, DatabaseModule, AssessmentsModule],
  controllers: [AssessmentAttemptsController],
  providers: [AssessmentAttemptsService, AssessmentResultsService],
})
export class AssessmentAttemptsModule {}
