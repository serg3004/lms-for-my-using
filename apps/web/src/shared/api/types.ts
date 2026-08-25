import type { UserRole } from '@lms/shared/types/api';

export type { ApiErrorDetail, ApiErrorResponse, PaginatedResponse, UserRole } from '@lms/shared/types/api';

export type LoginInput = {
  organizationId: string;
  email: string;
  password: string;
};

export type CurrentUser = {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  position: string | null;
  shift: string | null;
  phone: string | null;
  status: string;
  locale: string;
  timezone: string;
  roles: UserRole[];
};

export type UserPreferencesInput = Pick<CurrentUser, 'locale'>;

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: CurrentUser;
};

export type PasswordResetRequestInput = Pick<LoginInput, 'organizationId' | 'email'>;

export type PasswordResetConfirmInput = {
  token: string;
  password: string;
};

export type PasswordResetAcceptedResponse = { accepted: true };

export type CourseSummary = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  durationMinutes: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { lessons: number };
};

export type InstructorCourseSummary = CourseSummary & {
  metrics: { enrolled: number; inProgress: number; completed: number };
};

export type LessonSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  order: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonWithCourseSummary = LessonSummary & { course: { title: string } };

export type CourseMaterialSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  slug: string;
  description: string | null;
  kind: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgressSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  lessonId: string | null;
  userId: string;
  status: string;
  score: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    firstName: string;
    lastName: string | null;
    email: string;
  };
};

export type ProgressSummaryCourse = {
  courseId: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  status: 'completed' | 'in_progress';
  latestAssessmentScore: number | null;
};

export type ProgressSummaryStreakDay = {
  dayOfWeek: number;
  date: string;
  active: boolean;
};

export type ProgressSummaryActivityItem = {
  type: 'lesson_completed' | 'assessment_passed' | 'certificate_issued';
  courseId: string;
  courseTitle: string;
  score?: number;
  date: string;
};

export type ProgressSummaryReport = {
  period: 30 | 90 | 365;
  overallProgressPercent: number;
  lessonsCompletedCount: number;
  activeDaysCount: number;
  avgAssessmentScore: number | null;
  courses: ProgressSummaryCourse[];
  weeklyGoal: { completed: number; target: number };
  streak: ProgressSummaryStreakDay[];
  recentActivity: ProgressSummaryActivityItem[];
};

export type AssignmentSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  userId: string | null;
  groupId: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  course?: { title: string | null } | null;
};

export type AssessmentSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  availableAfterCourseCompletion: boolean;
  passMessage: string | null;
  failMessage: string | null;
  showCorrectAnswers: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CertificateSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  userId: string;
  assessmentAttemptId: string | null;
  status: string;
  issuedAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
  };
  course?: {
    id: string;
    title: string;
  };
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

export type OrganizationSummary = {
  id: string;
  name: string;
};

export type CreateLessonCompletionInput = {
  organizationId: string;
  courseId: string;
  lessonId: string;
  userId: string;
};

export type CreateAttemptAnswerInput = {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
};

export type AttemptAnswerResult = {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  selectedOptionIds: unknown;
  isCorrect: boolean;
  score: number;
  question: { id: string; title: string; type: string; points: number; order: number };
  selectedOption: { id: string; text: string | null; imageUrl: string | null } | null;
  /** Only present when the assessment author enabled showCorrectAnswers. */
  correctOptions?: { id: string; text: string | null; imageUrl: string | null }[];
};

export type AssessmentQuestionSummary = {
  id: string;
  organizationId: string;
  assessmentId: string;
  type: string;
  title: string;
  text: string | null;
  imageUrl: string | null;
  points: number;
  order: number;
};

export type AssessmentAttemptSummary = {
  id: string;
  organizationId: string;
  assessmentId: string;
  userId: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentAttemptResult = {
  id: string;
  organizationId: string;
  assessmentId: string;
  userId: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assessment: { id: string; title: string; slug: string; passingScore: number; passMessage: string | null; failMessage: string | null };
  user: { id: string; email: string; firstName: string; lastName: string };
  answers: AttemptAnswerResult[];
};

export type MembershipSummary = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  assignedBy: string | null;
  createdAt: string;
};

export type UserSummary = {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  status: string;
};

export type NotificationSummary = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ChecklistScaleLevel = {
  level: number;
  label: string;
  description?: string;
  points: number;
};

export type ChecklistScoringMode = 'sum_points' | 'all_required' | 'scale';
export type ChecklistStatus = 'draft' | 'published' | 'archived';
export type ChecklistInstanceStatus = 'assigned' | 'in_progress' | 'submitted' | 'completed' | 'expired';
export type ChecklistReviewStatus = 'pending' | 'approved' | 'rejected';

export type ChecklistItemSummary = {
  id: string;
  checklistId: string;
  order: number;
  text: string;
  points: number;
  isRequired: boolean;
  photoRequired: boolean;
};

export type ChecklistSummary = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: ChecklistStatus;
  scoringMode: ChecklistScoringMode;
  passThreshold: number;
  scaleLevels: ChecklistScaleLevel[] | null;
  requiresReview: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ChecklistItemSummary[];
};

export type ChecklistItemResultSummary = {
  id: string;
  itemId: string;
  checked: boolean;
  scaleLevel: number | null;
  points: number;
  photoUrl: string | null;
  photoFileName: string | null;
  comment: string | null;
  reviewStatus: ChecklistReviewStatus;
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type ChecklistInstanceSummary = {
  id: string;
  organizationId: string;
  checklistId: string;
  userId: string;
  assignedBy: string | null;
  status: ChecklistInstanceStatus;
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  dueAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  checklist?: ChecklistSummary;
  results: ChecklistItemResultSummary[];
};
