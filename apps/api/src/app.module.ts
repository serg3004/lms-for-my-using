import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CourseMaterialsModule } from './modules/course-materials/course-materials.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CourseMaterialsModule,
    CoursesModule,
    GroupsModule,
    HealthModule,
    LessonsModule,
    MembershipsModule,
    OrganizationsModule,
    UsersModule,
  ],
})
export class AppModule {}
