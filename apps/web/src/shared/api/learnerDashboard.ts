import { apiRequest } from '../apiClient.js';

type ContinueLearningCourse = {
  courseId: string;
  courseTitle: string;
  completedLessons: number;
  totalLessons: number;
};

type UpcomingDeadline = {
  id: string;
  courseTitle: string | null;
  dueAt: string;
};

type LearnerDashboardActivity =
  | { type: 'lesson_completed'; id: string; date: string; courseTitle: string }
  | { type: 'certificate_issued'; id: string; date: string; courseTitle: string };

export type LearnerDashboardSummary = {
  coursesCount: number;
  pendingAssignmentsCount: number;
  availableAssessmentsCount: number;
  certificatesCount: number;
  continueLearning: ContinueLearningCourse[];
  upcomingDeadlines: UpcomingDeadline[];
  recentActivity: LearnerDashboardActivity[];
};

export function getLearnerDashboardSummary() {
  return apiRequest<LearnerDashboardSummary>('/learner-dashboard');
}
