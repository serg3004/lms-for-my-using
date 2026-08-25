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
  overdueAssignments: {
    assignmentId: string;
    courseTitle: string;
    userId: string | null;
    groupId: string | null;
    groupName: string | null;
    dueAt: string;
  }[];
  members: ManagerTeamMember[];
};

export function getManagerTeamSummary() {
  return apiRequest<ManagerTeamSummary>('/manager/team-summary');
}

export type ManagerReminderResult = {
  sent: number;
  failed: number;
  results: { assignmentId: string; status: 'sent' | 'failed'; recipients?: number; reason?: 'not_applicable' | 'no_recipients' }[];
};

export function sendManagerOverdueReminders(assignmentIds: string[]) {
  return apiRequest<ManagerReminderResult>('/manager/overdue-reminders', {
    method: 'POST',
    body: JSON.stringify({ assignmentIds }),
  });
}
