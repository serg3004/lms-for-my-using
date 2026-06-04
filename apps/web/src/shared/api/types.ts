export type LoginInput = {
  organizationId: string;
  email: string;
  password: string;
};

export type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';

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

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: CurrentUser;
};

export type ApiErrorDetail = {
  field?: string;
  message: string;
  code?: string;
};

export type ApiErrorResponse = {
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  path: string;
  timestamp: string;
};

export type CourseSummary = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonSummary = {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

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
  availableAfterCourseCompletion: boolean;
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
  assessment: { id: string; title: string; slug: string; passingScore: number };
  user: { id: string; email: string; firstName: string; lastName: string };
  answers: AttemptAnswerResult[];
};
