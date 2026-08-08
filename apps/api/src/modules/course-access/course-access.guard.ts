import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CourseAccessPolicy, CourseResource } from './course-access.policy.js';

const courseScopeKey = 'course-scope';
type Scope = { source: 'param' | 'body'; key: string; resource?: CourseResource };

export const CourseScope = (source: Scope['source'], key: string, resource?: CourseResource) =>
  SetMetadata(courseScopeKey, { source, key, resource } satisfies Scope);

@Injectable()
export class CourseAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly policy: CourseAccessPolicy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<Scope>(courseScopeKey, context.getHandler());
    if (!scope) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.currentUser!;
    if (!this.policy.isInstructorScoped(user)) return true;
    const source = scope.source === 'param' ? request.params : request.body;
    const id = source?.[scope.key];
    if (typeof id !== 'string') return true; // validation handles malformed/missing input
    if (scope.resource) await this.policy.assertResourceAccess(scope.resource, id, user);
    else await this.policy.assertCourseAccess(id, user);
    return true;
  }
}
