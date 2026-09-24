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

// ---- PR 299: manager checklist analytics (`/manager/checklists`) ----

export type ManagerChecklistAnalyticsQuery = {
  from: string;
  to: string;
  checklistId?: string;
  departmentId?: string;
};

export type ManagerChecklistAnalyticsEmployeeRow = {
  userId: string;
  firstName: string;
  lastName: string;
  department: string | null;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  lastSessionAt: string | null;
};

export type ManagerChecklistAnalytics = {
  summary: {
    totalEmployees: number;
    totalSessions: number;
    completedSessions: number;
    averagePercentage: number;
    lowCount: number;
    highCount: number;
    noCompletionCount: number;
  };
  thresholds: { high: number; low: number | null };
  distribution: { bucket: 'low' | 'mid' | 'high'; count: number }[];
  trend: { date: string; averagePercentage: number; count: number }[];
  employees: ManagerChecklistAnalyticsEmployeeRow[];
};

function buildQueryString(params: Record<string, unknown>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))).toString()}` : '';
}

export function getManagerChecklistAnalytics(query: ManagerChecklistAnalyticsQuery) {
  return apiRequest<ManagerChecklistAnalytics>(`/checklists/manager-analytics${buildQueryString(query)}`);
}
