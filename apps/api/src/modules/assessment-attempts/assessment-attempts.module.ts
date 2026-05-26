import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AssessmentAttemptsController } from './assessment-attempts.controller.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AssessmentAttemptsController],
  providers: [AssessmentAttemptsService],
})
export class AssessmentAttemptsModule {}
