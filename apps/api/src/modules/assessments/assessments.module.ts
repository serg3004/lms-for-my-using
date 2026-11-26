import { UploadModule } from '../upload/upload.module.js';
import { AssessmentImagesController } from './assessment-images.controller.js';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';

import { BackgroundJobsModule } from '../background-jobs/public.js';
import { StandaloneAssessmentsController } from './standalone-assessments.controller.js';
import { StandaloneAssessmentsService } from './standalone-assessments.service.js';

import { AssessmentFoldersController } from './assessment-folders.controller.js';
import { AssessmentFoldersService } from './assessment-folders.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, BackgroundJobsModule, UploadModule],
  controllers: [AssessmentImagesController, AssessmentFoldersController, StandaloneAssessmentsController, AssessmentsController],
  providers: [AssessmentFoldersService, AssessmentsService, StandaloneAssessmentsService],
  exports: [StandaloneAssessmentsService],
})
export class AssessmentsModule {}
