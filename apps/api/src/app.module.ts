import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { PINO_REDACT_PATHS } from './common/logger/redact-paths.js';
import { ObservabilityModule } from './common/observability/observability.module.js';
import { getTelemetryContext, resolveRequestId } from './common/telemetry/telemetry-context.js';
import { DatabaseModule } from './database/database.module.js';
import { AssessmentAttemptsModule } from './modules/assessment-attempts/assessment-attempts.module.js';
import { AssessmentQuestionsModule } from './modules/assessment-questions/assessment-questions.module.js';
import { AssessmentsModule } from './modules/assessments/assessments.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { BackgroundJobsModule } from './modules/background-jobs/background-jobs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { ChecklistsModule } from './modules/checklists/checklists.module.js';
import { CourseMaterialsModule } from './modules/course-materials/course-materials.module.js';
import { CourseAccessModule } from './modules/course-access/course-access.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { ManagerModule } from './modules/manager/manager.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { ManagerTeamScopeModule } from './modules/manager-team-scope/manager-team-scope.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OpenApiModule } from './modules/openapi/openapi.module.js';
import { OutboxModule } from './modules/outbox/public.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { UploadModule } from './modules/upload/upload.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        redact: { paths: PINO_REDACT_PATHS, censor: '[REDACTED]' },
        genReqId: (req) => {
          const requestId = resolveRequestId(req.headers['x-request-id']);
          // Reuse the logger's ID in the application telemetry middleware instead
          // of generating a second ID when the caller omitted the header.
          req.headers['x-request-id'] = requestId;
          return requestId;
        },
        mixin: () => {
          const context = getTelemetryContext();
          return context ? { requestId: context.requestId } : {};
        },
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      },
    }),
    DatabaseModule,
    ObservabilityModule,
    CourseAccessModule,
    AssessmentAttemptsModule,
    AssessmentQuestionsModule,
    AssessmentsModule,
    AssignmentsModule,
    BackgroundJobsModule,
    AuthModule,
    CertificatesModule,
    ChecklistsModule,
    CourseMaterialsModule,
    CoursesModule,
    GroupsModule,
    HealthModule,
    LessonsModule,
    ManagerModule,
    MembershipsModule,
    ManagerTeamScopeModule,
    NotificationsModule,
    OpenApiModule,
    OutboxModule,
    OrganizationsModule,
    ProgressModule,
    ReportsModule,
    UploadModule,
    UsersModule,
  ],
})
export class AppModule {}
