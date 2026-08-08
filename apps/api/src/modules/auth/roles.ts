import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@lms/shared/constants/roles';

export type { UserRole } from '@lms/shared/constants/roles';

export const rolesMetadataKey = 'roles';
export const accessMetadataKey = 'access';

export type EndpointAccess = 'public' | 'authenticated';

export const rolePolicies = {
  organizationsRead: ['admin'],
  organizationsCreate: ['admin'],
  themeSettingsRead: ['admin', 'manager', 'instructor', 'learner'],
  themeSettingsWrite: ['admin'],
  usersRead: ['admin', 'manager'],
  usersCreate: ['admin', 'manager'],
  membershipsRead: ['admin', 'manager'],
  membershipsCreate: ['admin'],
  groupsRead: ['admin', 'manager'],
  groupsCreate: ['admin', 'manager'],
  coursesRead: ['admin', 'manager', 'instructor', 'learner'],
  coursesCreate: ['admin', 'instructor'],
  lessonsRead: ['admin', 'manager', 'instructor', 'learner'],
  lessonsReadAll: ['admin'],
  lessonsCreate: ['admin', 'instructor'],
  courseMaterialsRead: ['admin', 'manager', 'instructor', 'learner'],
  courseMaterialsCreate: ['admin', 'instructor'],
  assignmentsRead: ['admin', 'manager', 'instructor', 'learner'],
  assignmentsCreate: ['admin', 'manager', 'instructor'],
  progressRead: ['admin', 'manager', 'instructor', 'learner'],
  progressCreate: ['admin', 'manager', 'instructor', 'learner'],
  assessmentsRead: ['admin', 'manager', 'instructor', 'learner'],
  assessmentsCreate: ['admin', 'instructor'],
  assessmentQuestionsRead: ['admin', 'manager', 'instructor'],
  assessmentQuestionsCreate: ['admin', 'instructor'],
  assessmentAnswerOptionsRead: ['admin', 'manager', 'instructor'],
  assessmentAnswerOptionsCreate: ['admin', 'instructor'],
  assessmentAttemptsRead: ['admin', 'manager', 'instructor'],
  assessmentAttemptResultsRead: ['admin', 'manager', 'instructor', 'learner'],
  assessmentAttemptsCreate: ['admin', 'manager', 'instructor', 'learner'],
  certificatesRead: ['admin', 'manager', 'instructor', 'learner'],
  certificatesCreate: ['admin', 'manager', 'instructor'],
  managerTeamSummaryRead: ['admin', 'manager'],
} as const satisfies Record<string, readonly UserRole[]>;

export function Roles(...roles: UserRole[]) {
  return SetMetadata(rolesMetadataKey, roles);
}

export function PublicAccess() {
  return SetMetadata(accessMetadataKey, 'public' satisfies EndpointAccess);
}

export function AuthenticatedAccess() {
  return SetMetadata(accessMetadataKey, 'authenticated' satisfies EndpointAccess);
}

export function isLearnerOnly(roles: readonly UserRole[]): boolean {
  return !roles.some((r) => r === 'admin' || r === 'manager' || r === 'instructor');
}
