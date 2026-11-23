import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentQuestionsController } from './assessment-questions.controller.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';

import { AssessmentsModule } from '../assessments/public.js';

@Module({
  imports: [AuthModule, DatabaseModule, AssessmentsModule],
  controllers: [AssessmentQuestionsController],
  providers: [AssessmentQuestionsService],
})
export class AssessmentQuestionsModule {}
