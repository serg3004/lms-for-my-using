import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { AssessmentAttemptsModule } from './modules/assessment-attempts/assessment-attempts.module.js';
import { AssessmentQuestionsModule } from './modules/assessment-questions/assessment-questions.module.js';
import { AssessmentsModule } from './modules/assessments/assessments.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { CourseMaterialsModule } from './modules/course-materials/course-materials.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { OpenApiModule } from './modules/openapi/openapi.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    DatabaseModule,
    AssessmentAttemptsModule,
    AssessmentQuestionsModule,
    AssessmentsModule,
    AssignmentsModule,
    AuthModule,
    CertificatesModule,
    CourseMaterialsModule,
    CoursesModule,
    GroupsModule,
    HealthModule,
    LessonsModule,
    MembershipsModule,
    OpenApiModule,
    OrganizationsModule,
    ProgressModule,
    UsersModule,
  ],
})
export class AppModule {}
