import type { ManagerTeamMember, ManagerTeamSummary } from '../../shared/api/manager.js';

export type ManagerReportStatus = 'all' | ManagerTeamMember['status'];

export function filterReportMembers(
  members: ManagerTeamMember[],
  memberId: string,
  status: ManagerReportStatus,
) {
  return members.filter((member) =>
    (memberId === 'all' || member.userId === memberId)
    && (status === 'all' || member.status === status));
}

export function buildManagerReport(summary: ManagerTeamSummary, members: ManagerTeamMember[]) {
  const memberIds = new Set(members.map((member) => member.userId));
  const overdueCount = summary.overdueAssignments.filter((assignment) =>
    assignment.userId ? memberIds.has(assignment.userId) : members.length === summary.members.length).length;
  const enrollments = members.reduce((total, member) => total + member.activeCoursesCount, 0);
  const completionRate = members.length === 0
    ? 0
    : Math.round(members.reduce((total, member) => total + member.completionPercent, 0) / members.length);

  return { enrollments, completionRate, overdueCount, members };
}
