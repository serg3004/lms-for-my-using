import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseMaterialsController } from './course-materials.controller.js';
import { CourseMaterialsService } from './course-materials.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CourseMaterialsController],
  providers: [CourseMaterialsService],
})
export class CourseMaterialsModule {}
