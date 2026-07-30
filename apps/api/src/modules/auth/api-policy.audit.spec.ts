import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';

import { AssessmentAttemptsController } from '../assessment-attempts/assessment-attempts.controller.js';
import { AssessmentQuestionsController } from '../assessment-questions/assessment-questions.controller.js';
import { AssessmentsController } from '../assessments/assessments.controller.js';
import { AssignmentsController } from '../assignments/assignments.controller.js';
import { CertificatesController } from '../certificates/certificates.controller.js';
import { CourseMaterialsController } from '../course-materials/course-materials.controller.js';
import { CoursesController } from '../courses/courses.controller.js';
import { GroupsController } from '../groups/groups.controller.js';
import { HealthController } from '../health/health.controller.js';
import { LessonsController } from '../lessons/lessons.controller.js';
import { MembershipsController } from '../memberships/memberships.controller.js';
import { OpenApiController } from '../openapi/openapi.controller.js';
import { OrganizationsController } from '../organizations/organizations.controller.js';
import { ProgressController } from '../progress/progress.controller.js';
import { UploadController } from '../upload/upload.controller.js';
import { UsersController } from '../users/users.controller.js';
import { AuthController } from './auth.controller.js';
import { RolesGuard } from './roles.guard.js';
import { accessMetadataKey, rolesMetadataKey, type EndpointAccess, type UserRole } from './roles.js';

type ControllerClass = abstract new (...args: never[]) => object;

const controllers: ControllerClass[] = [
  AssessmentAttemptsController,
  AssessmentQuestionsController,
  AssessmentsController,
  AssignmentsController,
  AuthController,
  CertificatesController,
  CourseMaterialsController,
  CoursesController,
  GroupsController,
  HealthController,
  LessonsController,
  MembershipsController,
  OpenApiController,
  OrganizationsController,
  ProgressController,
  UploadController,
  UsersController,
];

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
    const files = controllerFiles(modulesDirectory).map((path) => relative(modulesDirectory, path));

    expect(files).toHaveLength(controllers.length);
  });

  it.each(controllers)('$name gives every endpoint exactly one explicit access policy', (Controller) => {
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
});
