import { Global, Module } from '@nestjs/common';

import { CourseAccessPolicy } from './course-access.policy.js';
import { CourseAccessGuard } from './course-access.guard.js';

@Global()
@Module({
  providers: [CourseAccessPolicy, CourseAccessGuard],
  exports: [CourseAccessPolicy, CourseAccessGuard],
})
export class CourseAccessModule {}
