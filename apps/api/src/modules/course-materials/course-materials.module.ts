import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { CourseMaterialsController } from './course-materials.controller.js';
import { CourseMaterialsService } from './course-materials.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, UploadModule],
  controllers: [CourseMaterialsController],
  providers: [CourseMaterialsService],
})
export class CourseMaterialsModule {}
