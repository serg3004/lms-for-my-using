import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PositionCoursesController } from './position-courses.controller.js';
import { PositionCoursesService } from './position-courses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PositionCoursesController],
  providers: [PositionCoursesService],
  exports: [PositionCoursesService],
})
export class PositionCoursesModule {}
