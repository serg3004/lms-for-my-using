import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { AssessmentAttemptsController } from '../assessment-attempts/assessment-attempts.controller.js';
import { AssessmentQuestionsController } from '../assessment-questions/assessment-questions.controller.js';
import { AssessmentsController } from '../assessments/assessments.controller.js';
import { AssignmentsController } from '../assignments/assignments.controller.js';
import { AuditLogController } from '../audit-log/audit-log.controller.js';
import { CertificatesController } from '../certificates/certificates.controller.js';
import { ChecklistsController } from '../checklists/checklists.controller.js';
import { CourseMaterialsController } from '../course-materials/course-materials.controller.js';
import { MaterialMalwareScanController } from '../course-materials/material-malware-scan.controller.js';
import { CoursesController } from '../courses/courses.controller.js';
import { DepartmentManagersController } from '../department-managers/department-managers.controller.js';
import { DepartmentMembershipsController } from '../department-memberships/department-memberships.controller.js';
import { DepartmentsController } from '../departments/departments.controller.js';
import { GroupsController } from '../groups/groups.controller.js';
import { HealthController } from '../health/health.controller.js';
import { LearnerDashboardController } from '../learner-dashboard/learner-dashboard.controller.js';
import { LessonsController } from '../lessons/lessons.controller.js';
import { ManagerController } from '../manager/manager.controller.js';
import { MembershipsController } from '../memberships/memberships.controller.js';
import { NotificationsController } from '../notifications/notifications.controller.js';
import { OpenApiController } from '../openapi/openapi.controller.js';
import { OrganizationsController } from '../organizations/organizations.controller.js';
import { OrgExternalReferencesController } from '../org-external-references/org-external-references.controller.js';
import { OrgStructureAdminController } from '../org-structure-admin/org-structure-admin.controller.js';
import { PositionCoursesController } from '../position-courses/position-courses.controller.js';
import { PositionsController } from '../positions/positions.controller.js';
import { ProgressController } from '../progress/progress.controller.js';
import { ReportingLinesController } from '../reporting-lines/reporting-lines.controller.js';
import { ReportsController } from '../reports/reports.controller.js';
import { UsersController } from '../users/users.controller.js';
import { AuthController } from './auth.controller.js';
import { RolesGuard } from './roles.guard.js';
import { accessMetadataKey, rolesMetadataKey, type EndpointAccess, type UserRole } from './roles.js';

type ControllerClass = abstract new (...args: never[]) => object;
type ControllerEntry = { file: string; Controller: ControllerClass };
type EndpointHandler = (...args: never[]) => unknown;

const controllerEntries: ControllerEntry[] = [
  { file: 'assessment-attempts/assessment-attempts.controller.ts', Controller: AssessmentAttemptsController },
  { file: 'assessment-questions/assessment-questions.controller.ts', Controller: AssessmentQuestionsController },
  { file: 'assessments/assessments.controller.ts', Controller: AssessmentsController },
  { file: 'assignments/assignments.controller.ts', Controller: AssignmentsController },
  { file: 'audit-log/audit-log.controller.ts', Controller: AuditLogController },
  { file: 'auth/auth.controller.ts', Controller: AuthController },
  { file: 'certificates/certificates.controller.ts', Controller: CertificatesController },
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

const allRoles: UserRole[] = ['admin', 'manager', 'instructor', 'mentor', 'learner'];

const protectedEndpoints = controllerEntries.flatMap(({ Controller }) =>
  Object.getOwnPropertyNames(Controller.prototype).flatMap((methodName) => {
    const handler = Object.getOwnPropertyDescriptor(Controller.prototype, methodName)?.value as unknown;
    const roles = typeof handler === 'function' ? (Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined) : undefined;

    return roles?.length ? [{ Controller, methodName, handler: handler as EndpointHandler, roles }] : [];
  }),
);

function roleContext(Controller: ControllerClass, handler: EndpointHandler, role: UserRole): ExecutionContext {
  const request = {
    currentUser: {
      id: 'user-id',
      organizationId: 'organization-id',
      email: 'user@example.com',
      roles: [role],
    },
  };

  return {
    getClass: () => Controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function rolesGuardFor(role: UserRole): RolesGuard {
  const prisma = {
    membership: {
      findMany: async () => [{ role }],
    },
  };

  return new RolesGuard(prisma as never, new Reflector());
}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return controllerFiles(path);
    }

    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('API access policy audit', () => {
  it('keeps the audit inventory synchronized with every production controller', () => {
    const modulesDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = controllerFiles(modulesDirectory)
      .map((path) => relative(modulesDirectory, path))
      .sort();

    expect(files).toEqual(controllerEntries.map(({ file }) => file).sort());
  });

  it.each(controllerEntries)('$Controller.name gives every endpoint exactly one explicit access policy', ({ Controller }) => {
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, Controller) as unknown[] | undefined;

    for (const methodName of Object.getOwnPropertyNames(Controller.prototype)) {
      const handler = Object.getOwnPropertyDescriptor(Controller.prototype, methodName)?.value as unknown;

      if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
        continue;
      }

      const roles = Reflect.getMetadata(rolesMetadataKey, handler) as UserRole[] | undefined;
      const access = Reflect.getMetadata(accessMetadataKey, handler) as EndpointAccess | undefined;
      const classifications = [roles?.length ? 'roles' : undefined, access].filter(Boolean);

      expect({ controller: Controller.name, method: methodName, classifications }).toEqual({
        controller: Controller.name,
        method: methodName,
        classifications: [expect.any(String)],
      });

      if (roles?.length) {
        const methodGuards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;
        expect([...(classGuards ?? []), ...(methodGuards ?? [])]).toContain(RolesGuard);
      }
    }
  });

  it.each(
    protectedEndpoints.flatMap(({ Controller, methodName, handler, roles }) =>
      allRoles.map((role) => ({ Controller, methodName, handler, roles, role })),
    ),
  )('$Controller.name.$methodName enforces the centralized policy for $role', async ({ Controller, handler, roles, role }) => {
    const authorization = rolesGuardFor(role).canActivate(roleContext(Controller, handler, role));

    if (roles.includes(role)) {
      await expect(authorization).resolves.toBe(true);
    } else {
      await expect(authorization).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
