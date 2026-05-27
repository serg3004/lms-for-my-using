import { SetMetadata } from '@nestjs/common';

export type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';

export const rolesMetadataKey = 'roles';

export const rolePolicies = {
  organizationsRead: ['admin'],
  usersRead: ['admin', 'manager'],
  usersCreate: ['admin', 'manager'],
  membershipsRead: ['admin', 'manager'],
  membershipsCreate: ['admin'],
  groupsRead: ['admin', 'manager'],
  groupsCreate: ['admin', 'manager'],
  coursesRead: ['admin', 'manager', 'instructor'],
  coursesCreate: ['admin', 'instructor'],
  lessonsRead: ['admin', 'manager', 'instructor'],
  lessonsCreate: ['admin', 'instructor'],
  courseMaterialsRead: ['admin', 'manager', 'instructor'],
  courseMaterialsCreate: ['admin', 'instructor'],
  assignmentsRead: ['admin', 'manager', 'instructor'],
  assignmentsCreate: ['admin', 'manager', 'instructor'],
  progressRead: ['admin', 'manager', 'instructor'],
  progressCreate: ['admin', 'manager', 'instructor'],
  assessmentsRead: ['admin', 'manager', 'instructor'],
  assessmentsCreate: ['admin', 'instructor'],
  assessmentQuestionsRead: ['admin', 'manager', 'instructor'],
  assessmentQuestionsCreate: ['admin', 'instructor'],
  assessmentAnswerOptionsRead: ['admin', 'manager', 'instructor'],
  assessmentAnswerOptionsCreate: ['admin', 'instructor'],
  assessmentAttemptsRead: ['admin', 'manager', 'instructor'],
  assessmentAttemptResultsRead: ['admin', 'manager', 'instructor', 'learner'],
  assessmentAttemptsCreate: ['admin', 'manager', 'instructor', 'learner'],
} as const satisfies Record<string, readonly UserRole[]>;

export function Roles(...roles: UserRole[]) {
  return SetMetadata(rolesMetadataKey, roles);
}
