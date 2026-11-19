import { AssessmentAttemptsController } from '../assessment-attempts/assessment-attempts.controller.js';
import { AssessmentQuestionsController } from '../assessment-questions/assessment-questions.controller.js';
import { AssessmentsController } from '../assessments/assessments.controller.js';
import { AssignmentsController } from '../assignments/assignments.controller.js';
import { AuditLogController } from '../audit-log/audit-log.controller.js';
import { AuthController } from './auth.controller.js';
import { CertificatesController } from '../certificates/certificates.controller.js';
import { ChecklistFoldersController } from '../checklists/checklist-folders.controller.js';
import { ChecklistPublicController } from '../checklists/checklist-public.controller.js';
import { ChecklistsController } from '../checklists/checklists.controller.js';
import { CourseMaterialsController } from '../course-materials/course-materials.controller.js';
import { CoursesController } from '../courses/courses.controller.js';
import { DepartmentManagersController } from '../department-managers/department-managers.controller.js';
import { DepartmentMembershipsController } from '../department-memberships/department-memberships.controller.js';
import { DepartmentsController } from '../departments/departments.controller.js';
import { GroupsController } from '../groups/groups.controller.js';
import { HealthController } from '../health/health.controller.js';
import { LearnerDashboardController } from '../learner-dashboard/learner-dashboard.controller.js';
import { LessonsController } from '../lessons/lessons.controller.js';
import { LongreadFilesController } from '../longreads/longread-files.controller.js';
import { LongreadsController } from '../longreads/longreads.controller.js';
import { ManagerController } from '../manager/manager.controller.js';
import { MaterialMalwareScanController } from '../course-materials/material-malware-scan.controller.js';
import { MembershipsController } from '../memberships/memberships.controller.js';
import { NotificationsController } from '../notifications/notifications.controller.js';
import { OpenApiController } from '../openapi/openapi.controller.js';
import { OrgExternalReferencesController } from '../org-external-references/org-external-references.controller.js';
import { OrgStructureAdminController } from '../org-structure-admin/org-structure-admin.controller.js';
import { OrganizationsController } from '../organizations/organizations.controller.js';
import { PositionCoursesController } from '../position-courses/position-courses.controller.js';
import { PositionsController } from '../positions/positions.controller.js';
import { ProgressController } from '../progress/progress.controller.js';
import { ReportingLinesController } from '../reporting-lines/reporting-lines.controller.js';
import { ReportsController } from '../reports/reports.controller.js';
import { UsersController } from '../users/users.controller.js';

export type ControllerClass = abstract new (...args: never[]) => object;
export type ControllerEntry = { file: string; Controller: ControllerClass };
export type EndpointHandler = (...args: never[]) => unknown;

export const controllerEntries: ControllerEntry[] = [
  { file: 'assessment-attempts/assessment-attempts.controller.ts', Controller: AssessmentAttemptsController },
  { file: 'assessment-questions/assessment-questions.controller.ts', Controller: AssessmentQuestionsController },
  { file: 'assessments/assessments.controller.ts', Controller: AssessmentsController },
  { file: 'assignments/assignments.controller.ts', Controller: AssignmentsController },
  { file: 'audit-log/audit-log.controller.ts', Controller: AuditLogController },
  { file: 'auth/auth.controller.ts', Controller: AuthController },
  { file: 'certificates/certificates.controller.ts', Controller: CertificatesController },
  { file: 'checklists/checklist-folders.controller.ts', Controller: ChecklistFoldersController },
  { file: 'checklists/checklist-public.controller.ts', Controller: ChecklistPublicController },
  { file: 'checklists/checklists.controller.ts', Controller: ChecklistsController },
  { file: 'course-materials/course-materials.controller.ts', Controller: CourseMaterialsController },
  { file: 'course-materials/material-malware-scan.controller.ts', Controller: MaterialMalwareScanController },
  { file: 'courses/courses.controller.ts', Controller: CoursesController },
  { file: 'department-managers/department-managers.controller.ts', Controller: DepartmentManagersController },
  { file: 'department-memberships/department-memberships.controller.ts', Controller: DepartmentMembershipsController },
  { file: 'departments/departments.controller.ts', Controller: DepartmentsController },
  { file: 'groups/groups.controller.ts', Controller: GroupsController },
  { file: 'health/health.controller.ts', Controller: HealthController },
  { file: 'learner-dashboard/learner-dashboard.controller.ts', Controller: LearnerDashboardController },
  { file: 'lessons/lessons.controller.ts', Controller: LessonsController },
  { file: 'longreads/longread-files.controller.ts', Controller: LongreadFilesController },
  { file: 'longreads/longreads.controller.ts', Controller: LongreadsController },
  { file: 'manager/manager.controller.ts', Controller: ManagerController },
  { file: 'memberships/memberships.controller.ts', Controller: MembershipsController },
  { file: 'notifications/notifications.controller.ts', Controller: NotificationsController },
  { file: 'openapi/openapi.controller.ts', Controller: OpenApiController },
  { file: 'organizations/organizations.controller.ts', Controller: OrganizationsController },
  { file: 'org-external-references/org-external-references.controller.ts', Controller: OrgExternalReferencesController },
  { file: 'org-structure-admin/org-structure-admin.controller.ts', Controller: OrgStructureAdminController },
  { file: 'position-courses/position-courses.controller.ts', Controller: PositionCoursesController },
  { file: 'positions/positions.controller.ts', Controller: PositionsController },
  { file: 'progress/progress.controller.ts', Controller: ProgressController },
  { file: 'reporting-lines/reporting-lines.controller.ts', Controller: ReportingLinesController },
  { file: 'reports/reports.controller.ts', Controller: ReportsController },
  { file: 'users/users.controller.ts', Controller: UsersController },
];

