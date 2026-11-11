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
  managerId?: string;
  from: string;
  to: string;
  checklistId?: string;
  departmentId?: string;
};

export type ManagerChecklistAnalyticsEmployeeRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  departmentId: string | null;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  /** Band of the average against the settings thresholds (PR 350); null without a completed scored session. */
  performance: 'low' | 'mid' | 'high' | null;
  lastSessionAt: string | null;
};

export type ManagerChecklistAnalyticsDepartmentRow = {
  departmentId: string;
  name: string;
  employeesCount: number;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  noCompletionCount: number;
};

export type ManagerChecklistAnalyticsManagerRow = {
  managerId: string | null;
  name: string | null;
  employeesCount: number;
  completedCount: number;
  averagePercentage: number | null;
};

export type ManagerChecklistAnalytics = {
  summary: {
    totalEmployees: number;
    totalSessions: number;
    completedSessions: number;
    /** PR 380: results finished without an observation session (free access or self-passed), counted in the averages. */
    selfCompletedCount: number;
    averagePercentage: number;
    lowCount: number;
    highCount: number;
    noCompletionCount: number;
  };
  thresholds: { high: number; low: number | null };
  distribution: { bucket: 'low' | 'mid' | 'high'; count: number }[];
  trend: { date: string; averagePercentage: number; count: number }[];
  employees: ManagerChecklistAnalyticsEmployeeRow[];
  /** Roll-up of the whole zone per department (independent of the department filter). */
  departments: ManagerChecklistAnalyticsDepartmentRow[];
  managers: ManagerChecklistAnalyticsManagerRow[];
  managerOptions: { id: string; name: string }[];
  /** Departments of the caller's zone for the filter; never wider than the employee scope. */
  departmentOptions: { id: string; name: string }[];
};

export type ManagerChecklistEmployeesExportQuery = ManagerChecklistAnalyticsQuery & {
  q?: string;
  noCompletion?: 'true' | 'false';
  performance?: 'low' | 'high';
  sort?: 'employee' | 'department' | 'sessions' | 'average';
  dir?: 'asc' | 'desc';
  format?: 'csv' | 'xlsx';
};

function buildQueryString(params: Record<string, unknown>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))).toString()}` : '';
}

export function getManagerChecklistAnalytics(query: ManagerChecklistAnalyticsQuery) {
  return apiRequest<ManagerChecklistAnalytics>(`/checklists/manager-analytics${buildQueryString(query)}`);
}

/** PR 336: CSV of the employees table with the dashboard's own filters and view (built and audited server-side). */
export function exportManagerChecklistEmployees(query: ManagerChecklistEmployeesExportQuery) {
  return apiRequest<{ filename: string; csv: string; rows: (string | number)[][]; rowCount: number }>(`/checklists/manager-analytics/export${buildQueryString(query)}`);
}

/** PR 356: the same server-built rows as the manager breakdown, with the dashboard's domain filters. */
export function exportManagerChecklistManagers(query: ManagerChecklistAnalyticsQuery & { format?: 'csv' | 'xlsx' }) {
  return apiRequest<{ filename: string; csv: string; rows: (string | number)[][]; rowCount: number }>(`/checklists/manager-analytics/export${buildQueryString({ ...query, table: 'managers' })}`);
}

// ---- PR 461: analytics over several sheets (the "Analytics" tab) ----

export type SheetAnalyticsQuery = { from: string; to: string; checklistIds?: string[]; departmentId?: string; managerId?: string };

export type SheetAnalyticsSheet = { id: string; title: string; status: string; folderId: string | null; sessionsInPeriod: number };

export type SheetAnalyticsLevel = { value: number; label: string | null; labelKey: 'yes' | 'no' | null; color: string | null; count: number };
export type SheetAnalyticsScale = { scaleKey: string; kind: 'yes_no' | 'sheet' | 'scale'; name: string | null; levels: SheetAnalyticsLevel[] };
export type SheetAnalyticsMetrics = {
  plan: { planned: number; completed: number; inProgress: number; notStarted: number; overdue: number; remaining: number };
  completionPercentage: number | null;
  selfCompleted: number;
  averagePercentage: number | null;
  criteria: { total: number; answered: number; skipped: number; remaining: number; zeroPoints: number };
  scales: SheetAnalyticsScale[];
  queue: { notStarted: number; oldestDays: number | null };
};
export type SheetAnalytics = {
  total: SheetAnalyticsMetrics;
  sheets: Array<SheetAnalyticsMetrics & { checklistId: string; title: string }>;
  period: { from: string; to: string };
  truncated: boolean;
};

export function listSheetAnalyticsSheets(query: Pick<SheetAnalyticsQuery, 'from' | 'to'>) {
  return apiRequest<SheetAnalyticsSheet[]>(`/checklists/analytics/sheets${buildQueryString(query)}`);
}

export function getSheetAnalytics({ checklistIds, ...query }: SheetAnalyticsQuery) {
  return apiRequest<SheetAnalytics>(`/checklists/analytics/overview${buildQueryString({ ...query, checklistIds: checklistIds?.join(',') })}`);
}

// ---- PR 462: one sheet cut by criteria, groups, feedback fields and notes ----

export type ItemAnalyticsMetrics = {
  total: number; answered: number; skipped: number; remaining: number;
  completionPercentage: number | null; averagePercentage: number | null;
  scoreSum: number; scoreMax: number; withNote: number; noteShare: number | null;
  scales: SheetAnalyticsScale[];
};
export type ItemAnalyticsCriterion = ItemAnalyticsMetrics & { id: string; text: string; groupId: string | null };
export type ItemAnalyticsGroup = ItemAnalyticsMetrics & { id: string | null; title: string | null; criteriaCount: number };
export type ItemAnalyticsFeedbackField = { id: string; kind: 'text' | 'choice'; title: string; builtin: string | null; sessions: number; filled: number; notFilled: number; options: Array<{ id: string; name: string; count: number }> };
export type ItemAnalyticsNote = { sessionId: string | null; itemId: string; itemText: string; comment: string | null; reviewComment: string | null; at: string | null; employee: string; observer: string | null };
export type ItemAnalytics = {
  by: 'criteria' | 'groups' | 'feedback' | 'notes';
  instances: number;
  criteria?: ItemAnalyticsCriterion[] | Array<{ id: string; text: string; answered: number; withNote: number; noteShare: number | null }>;
  groups?: ItemAnalyticsGroup[];
  feedback?: ItemAnalyticsFeedbackField[];
  notes?: { total: number; page: number; pageSize: number; items: ItemAnalyticsNote[] };
  period: { from: string; to: string };
  truncated: boolean;
};

export function getItemAnalytics(checklistId: string, query: { by: ItemAnalytics['by']; from: string; to: string; departmentId?: string; managerId?: string; page?: number; itemId?: string }) {
  return apiRequest<ItemAnalytics>(`/checklists/${encodeURIComponent(checklistId)}/analytics/items${buildQueryString(query)}`);
}

// ---- PR 463: the export of the current view of the Analytics tab ----

export type SheetAnalyticsExportQuery = {
  view: 'sheets' | 'criteria' | 'groups' | 'feedback' | 'notes';
  from: string; to: string;
  checklistIds?: string[]; checklistId?: string; departmentId?: string; managerId?: string;
  pick?: string[]; q?: string; sort?: 'order' | 'completion' | 'average'; itemId?: string;
  format: 'csv' | 'xlsx';
};

export function exportSheetAnalytics({ checklistIds, pick, ...query }: SheetAnalyticsExportQuery) {
  return apiRequest<{ filename: string; csv: string; rows: (string | number)[][]; rowCount: number }>(
    `/checklists/analytics/export${buildQueryString({ ...query, checklistIds: checklistIds?.join(','), pick: pick?.join(',') })}`,
  );
}
