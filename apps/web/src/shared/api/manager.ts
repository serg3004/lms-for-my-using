import { apiRequest } from '../apiClient.js';

export type ManagerTeamMember = {
  userId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  activeCoursesCount: number;
  completionPercent: number;
  status: 'good' | 'risk';
};

export type ManagerTeamSummary = {
  membersCount: number;
  completionRate: number;
  dueThisWeekCount: number;
  overdueCount: number;
  avgTeamScore: number | null;
  upcomingDeadlines: { courseTitle: string; userId: string; dueAt: string }[];
  overdueAssignments: { assignmentId: string; courseTitle: string; userId: string; dueAt: string }[];
  members: ManagerTeamMember[];
};

export function getManagerTeamSummary() {
  return apiRequest<ManagerTeamSummary>('/manager/team-summary');
}
