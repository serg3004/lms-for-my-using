import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AssessmentQuestionsController } from './assessment-questions.controller.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AssessmentQuestionsController],
  providers: [AssessmentQuestionsService],
})
export class AssessmentQuestionsModule {}
