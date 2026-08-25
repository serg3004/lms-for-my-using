import { apiRequest } from '../apiClient.js';

type AdminDashboardActivity =
  | { type: 'user_added'; id: string; date: string; firstName: string; lastName: string | null }
  | { type: 'certificate_issued' | 'lesson_completed'; id: string; date: string };

export type AdminDashboardSummary = {
  usersTotal: number;
  coursesTotal: number;
  completionRate: number;
  certificatesTotal: number;
  pendingActivationCount: number;
  activity: AdminDashboardActivity[];
};

export function getAdminDashboardSummary() {
  return apiRequest<AdminDashboardSummary>('/reports/admin-dashboard');
}
