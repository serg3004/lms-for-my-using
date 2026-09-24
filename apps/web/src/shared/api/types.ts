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

export type CourseCompletion = {
  courseId: string;
  userId: string;
  organizationId: string;
  totalLessons: number;
  completedLessons: number;
  isCompleted: boolean;
  percentage: number;
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
  departmentId: string | null;
  includeDescendants: boolean;
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
  // PR 290/293/296 fields -- optional so pre-existing test fixtures across the codebase that
  // predate them don't all need updating; the server always sends real values (weight defaults
  // to 1, the rest to false/null), so `?? <default>` at the read site is the correct fallback.
  weight?: number;
  allowSkip?: boolean;
  autoSkipUnanswered?: boolean;
  scaleId?: string | null;
  groupId?: string | null;
  // PR 293: the item's per-criterion reusable scale, resolved once at assignment time and frozen
  // into the instance's checklist -- readers use this directly, never `scaleId` against the live
  // scale library (which may have moved on since).
  scale?: { id: string; name: string; levels: ChecklistScaleLevelSummary[] } | null;
};

// ---- PR 296: observation-sheet builder (context fields, item groups, sheet-level settings) ----

export type ChecklistContextFieldType = 'text' | 'textarea' | 'date';

export type ContextField = {
  id: string;
  label: string;
  type: ChecklistContextFieldType;
  required: boolean;
  order: number;
};

export type ChecklistPreSessionVisibility = 'full' | 'structure_only' | 'none';

export type ChecklistItemGroup = {
  id: string;
  checklistId: string;
  title: string;
  order: number;
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
  // PR 296 fields -- optional for the same reason as ChecklistItemSummary's above.
  contextFields?: ContextField[] | null;
  defaultLocationCapturePolicy?: ChecklistGeolocationPolicy | null;
  preSessionVisibility?: ChecklistPreSessionVisibility;
  itemGroups?: ChecklistItemGroup[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ChecklistItemSummary[];
};

// ---- PR 293: reusable evaluation scale library ----

export type ChecklistScaleStatus = 'active' | 'archived';

export type ChecklistScaleLevelSummary = {
  value: number;
  label: string;
  score: number;
};

export type ChecklistScaleSummary = {
  id: string;
  organizationId: string;
  name: string;
  status: ChecklistScaleStatus;
  levels: ChecklistScaleLevelSummary[];
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
  reviewerId: string | null;
  reviewAssignedAt: string | null;
  reviewAssignedBy: string | null;
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

export type ChecklistInstanceEventType =
  | 'assigned'
  | 'started'
  | 'item_answered'
  | 'photo_attached'
  | 'submitted'
  | 'reviewer_assigned'
  | 'item_approved'
  | 'item_rejected'
  | 'completed'
  | 'expired';

export type ChecklistInstanceEvent = {
  id: string;
  organizationId: string;
  instanceId: string;
  eventType: ChecklistInstanceEventType;
  actorUserId: string | null;
  itemId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ChecklistReviewQueueQuery = {
  assignment?: 'mine' | 'unassigned' | 'all';
  checklistId?: string;
  learnerId?: string;
  status?: ChecklistInstanceStatus;
  passed?: 'true' | 'false';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type ChecklistAnalyticsQuery = {
  checklistId?: string;
  from?: string;
  to?: string;
};

export type ChecklistAnalyticsCounts = {
  assigned: number;
  in_progress: number;
  submitted: number;
  completed: number;
  expired: number;
};

export type ChecklistAnalytics = {
  assignmentsTotal: number;
  counts: ChecklistAnalyticsCounts;
  completionRate: number;
  passRate: number;
  averagePercentage: number;
  expiredRate: number;
  pendingReview: number;
  averageCompletionTimeMs: number;
  averageReviewTimeMs: number;
};

// ---- Checklist sessions (workplace-training "session" mode, PR 289/292) ----

export type ChecklistSessionStatus = 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export type ChecklistGeolocationPolicy = 'off' | 'optional' | 'required';

export type ChecklistSessionParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
};

// The list/get projection (`presentProjected` on the API) -- a ChecklistSession row joined with
// its underlying ChecklistInstance's checklist/learner/result, exactly what the sessions list
// table and detail views need without a second round trip.
export type ChecklistSessionSummary = {
  id: string;
  organizationId: string;
  instanceId: string;
  observerId: string;
  status: ChecklistSessionStatus;
  version: number;
  scheduledAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  locationCapturePolicy: ChecklistGeolocationPolicy;
  timezone: string;
  overdue: boolean;
  // Structured feedback (PR 297) -- session-level, optional since it's only filled in once the
  // observer starts recording it.
  strengths: string | null;
  developmentAreas: string | null;
  nextSteps: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: { id: string; title: string };
  learner: { id: string; firstName: string; lastName: string; email: string };
  observer: { id: string; firstName: string; lastName: string; email: string };
  // PR 298: masked (percentage/passed/scored nulled, visible=false) for the learner while the
  // tenant's `feedbackVisibility` is `after_completion` and the instance isn't `completed` yet --
  // never masked for admin/manager/instructor, nor once the instance completes.
  result: { instanceStatus: ChecklistInstanceStatus; percentage: number | null; passed: boolean | null; scored: boolean | null; visible: boolean };
};

export type ChecklistSessionQuery = {
  status?: ChecklistSessionStatus;
  observerId?: string;
  checklistId?: string;
  learnerId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  search?: string;
  overdueOnly?: 'true' | 'false';
  page?: number;
  pageSize?: number;
};

export type ChecklistSessionParticipantsQuery = {
  role: 'learner' | 'observer';
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CreateChecklistSessionInput = {
  instanceId: string;
  observerId: string;
  scheduledAt?: string | null;
  locationCapturePolicy?: ChecklistGeolocationPolicy;
  timezone?: string;
};

export type BulkCreateChecklistSessionInput = {
  checklistId: string;
  learnerIds: string[];
  observerId: string;
  scheduledAt?: string | null;
  locationCapturePolicy?: ChecklistGeolocationPolicy;
  timezone?: string;
};

export type BulkCreateChecklistSessionRecipientStatus = 'created' | 'skipped' | 'failed';

export type BulkCreateChecklistSessionResult = {
  created: number;
  skipped: number;
  failed: number;
  results: Array<{ learnerId: string; status: BulkCreateChecklistSessionRecipientStatus; sessionId?: string; reason?: string }>;
};

export type UpdateChecklistSessionInput = {
  observerId?: string;
  scheduledAt?: string | null;
  locationCapturePolicy?: ChecklistGeolocationPolicy;
  timezone?: string;
  version: number;
};

export type ChecklistSessionAction = 'start' | 'pause' | 'resume' | 'complete' | 'cancel';

// The bare row (no checklist/learner/observer/result projection) -- what create/transition/repeat
// return, as opposed to list/get's joined ChecklistSessionSummary.
export type ChecklistSession = {
  id: string;
  organizationId: string;
  instanceId: string;
  observerId: string;
  status: ChecklistSessionStatus;
  version: number;
  scheduledAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  locationCapturePolicy: ChecklistGeolocationPolicy;
  timezone: string;
  overdue: boolean;
  strengths: string | null;
  developmentAreas: string | null;
  nextSteps: string | null;
  createdAt: string;
  updatedAt: string;
};

// Structured feedback (PR 297): every field optional so the observer can autosave partial
// progress; `version` is required for the same optimistic-concurrency contract as every other
// session mutation.
export type SubmitChecklistSessionFeedbackInput = {
  strengths?: string | null;
  developmentAreas?: string | null;
  nextSteps?: string | null;
  version: number;
};

// ---- Session events + geolocation capture (PR 290/297) ----

export type ChecklistSessionEventType =
  | 'created'
  | 'rescheduled'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'cancelled'
  | 'observer_reassigned'
  | 'reminder_sent'
  | 'location_override'
  | 'feedback_updated';

export type ChecklistSessionEvent = {
  id: string;
  organizationId: string;
  sessionId: string;
  eventType: ChecklistSessionEventType;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ChecklistLocationCapturePoint = 'start' | 'end';
export type ChecklistLocationCaptureStatus = 'captured' | 'denied' | 'unavailable';

export type SubmitChecklistLocationCaptureInput = {
  status: ChecklistLocationCaptureStatus;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  overrideReason?: string;
};

// Coordinates (latitude/longitude/accuracyMeters) are present only in the admin/assigned-observer
// projection -- everyone else with read access sees this same shape with those fields omitted.
export type ChecklistLocationCapture = {
  id: string;
  organizationId: string;
  sessionId: string;
  capturePoint: ChecklistLocationCapturePoint;
  status: ChecklistLocationCaptureStatus;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  capturedBy: string | null;
  capturedAt: string;
};
