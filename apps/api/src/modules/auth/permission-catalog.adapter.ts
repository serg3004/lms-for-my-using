import {
  PERMISSION_ACTIONS,
  type PermissionActionKey,
} from '@lms/shared/permission-catalog';

import { rolePolicies, type UserRole } from './roles.js';

type PolicyName = keyof typeof rolePolicies;

/**
 * PR 479: the policy that decides each catalog action for the five built-in roles today. This adapter is what keeps
 * built-in behaviour identical: nothing here grants anything new, it only names the existing decision.
 * Two actions may share a policy (a longread is edited with the same right as a lesson).
 */
export const actionPolicies: Readonly<Record<PermissionActionKey, PolicyName>> = {
  'checklist.library.read': 'checklistsRead',
  'checklist.author': 'checklistsCreate',
  'checklist.template.manage': 'checklistTemplatesManage',
  'checklist.free.start': 'checklistsStartFree',
  'checklist.assign': 'checklistInstancesCreate',
  'checklist.instance.read': 'checklistInstancesRead',
  'checklist.answer.write': 'checklistItemResultsWrite',
  'checklist.session.read': 'checklistSessionsRead',
  'checklist.session.manage': 'checklistSessionsManage',
  'checklist.session.create.own': 'checklistSessionsCreateOwn',
  'checklist.session.import': 'checklistSessionsImport',
  'checklist.session.conduct': 'checklistSessionsRunOwn',
  'checklist.analytics.read': 'checklistManagerAnalyticsRead',
  'checklist.workplace.read': 'checklistWorkplaceSettingsRead',
  'checklist.workplace.write': 'checklistWorkplaceSettingsWrite',
  'checklist.results.delete': 'checklistResultsDelete',
  'checklist.review.write': 'checklistReviewWrite',
  'checklist.score.recalculate': 'checklistScoreRecalculate',
  'checklist.access.settings': 'checklistAccessSettingsWrite',
  'assessment.attempt.read': 'assessmentAttemptsRead',
  'assessment.attempt.result.read': 'assessmentAttemptResultsRead',
  'course.read': 'coursesRead',
  'course.edit': 'coursesCreate',
  'lesson.read': 'lessonsRead',
  'lesson.read.all': 'lessonsReadAll',
  'lesson.edit': 'lessonsCreate',
  'material.read': 'courseMaterialsRead',
  'material.edit': 'courseMaterialsCreate',
  'longread.read': 'lessonsRead',
  'longread.edit': 'lessonsCreate',
  'assessment.read': 'assessmentsRead',
  'assessment.author': 'assessmentsCreate',
  'assessment.question.read': 'assessmentQuestionsRead',
  'assessment.question.edit': 'assessmentQuestionsCreate',
  'assessment.option.read': 'assessmentAnswerOptionsRead',
  'assessment.option.edit': 'assessmentAnswerOptionsCreate',
  'assessment.attempt.start': 'assessmentAttemptsCreate',
  'report.summary.read': 'reportsRead',
  'report.team.read': 'managerTeamSummaryRead',
  'report.course.read': 'courseAnalyticsRead',
  'report.admin.dashboard.read': 'adminDashboardRead',
  'user.read': 'usersRead',
  'user.create': 'usersCreate',
  'user.import': 'usersImport',
  'user.update': 'usersUpdate',
  'user.deactivate': 'usersDeactivate',
  'user.reset-password': 'usersResetPassword',
};

/** The built-in roles that hold the action. */
export function builtInRolesFor(action: PermissionActionKey): readonly UserRole[] {
  return rolePolicies[actionPolicies[action]];
}

/** Every catalog action a built-in role holds today. */
export function builtInActionsForRole(role: UserRole): PermissionActionKey[] {
  return PERMISSION_ACTIONS.map((item) => item.key).filter((key) => builtInRolesFor(key).includes(role));
}
