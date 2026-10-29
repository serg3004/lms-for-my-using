import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@lms/shared/types/api';

export type { UserRole } from '@lms/shared/types/api';

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
  groupsWrite: ['admin'],
  groupMembersWrite: ['admin', 'manager'],
  groupManagersWrite: ['admin'],
  departmentsRead: ['admin'],
  departmentsWrite: ['admin'],
  departmentTypesRead: ['admin'],
  departmentTypesWrite: ['admin'],
  departmentMembershipsRead: ['admin'],
  departmentMembershipsWrite: ['admin'],
  departmentManagersRead: ['admin'],
  departmentManagersWrite: ['admin'],
  reportingLinesRead: ['admin'],
  reportingLinesWrite: ['admin'],
  positionsRead: ['admin'],
  positionsWrite: ['admin'],
  positionCoursesRead: ['admin'],
  positionCoursesWrite: ['admin'],
  orgExternalReferencesRead: ['admin'],
  orgExternalReferencesWrite: ['admin'],
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
  reportsRead: ['admin', 'manager'],
  learnerDashboardRead: ['admin', 'manager', 'instructor', 'learner'],
  auditLogRead: ['admin'],
  notificationsRead: ['admin', 'manager', 'instructor', 'learner'],
  notificationsWrite: ['admin', 'manager', 'instructor', 'learner'],
  // PR 349: fixed role grants; custom permission sets are planned under DEC-CHKS-004.
  // A conduct grant still needs observerActionScope(), independently of manager read access.
  // PR 362: the four organization roles of the rights table build and edit checklists (whole organization,
  // owner decision 3 pending: nothing is narrowed to "own" checklists); the learner never does.
  checklistsRead: ['admin', 'manager', 'instructor', 'mentor'],
  checklistsCreate: ['admin', 'manager', 'instructor', 'mentor'],
  // PR 353: any role starts a free-access checklist for themselves only (service enforces the subject).
  checklistsStartFree: ['admin', 'manager', 'instructor', 'mentor', 'learner'],
  checklistInstancesRead: ['admin', 'manager', 'instructor', 'mentor', 'learner'],
  checklistInstancesCreate: ['admin', 'manager', 'instructor'],
  checklistItemResultsWrite: ['admin', 'manager', 'instructor', 'learner'],
  checklistReviewWrite: ['admin', 'manager', 'instructor', 'mentor'],
  checklistWorkplaceSettingsRead: ['admin', 'manager', 'instructor', 'mentor', 'learner'],
  checklistWorkplaceSettingsWrite: ['admin', 'manager', 'instructor', 'mentor'],
  checklistSessionsRead: ['admin', 'manager', 'instructor', 'mentor', 'learner'],
  checklistSessionsManage: ['admin', 'manager', 'instructor', 'mentor'],
  checklistSessionsCreateOwn: ['instructor'],
  // PR 360: who may pick any observer when scheduling; the instructor stays pinned to themselves.
  checklistSessionsCreateAnyObserver: ['admin', 'manager', 'mentor'],
  checklistSessionsRunOwn: ['admin', 'manager', 'instructor', 'mentor', 'learner'],
  // PR 363: employee analytics and their exports; the manager is team-scoped, the other three see the whole organization.
  checklistManagerAnalyticsRead: ['admin', 'manager', 'instructor', 'mentor'],
  checklistScoreRecalculate: ['admin', 'manager', 'instructor', 'mentor'],
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
  return !roles.some((r) => r === 'admin' || r === 'manager' || r === 'instructor' || r === 'mentor');
}
