import type { QuestionDefinition, QuestionResponse } from '@lms/shared/assessment-question-types';
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
  response?: QuestionResponse;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
};

export type AttemptAnswerResult = {
  id: string;
  response?: QuestionResponse;
  correctDefinition?: QuestionDefinition;
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
  definition?: QuestionDefinition | null;
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

export type ChecklistAccessMode = 'assigned' | 'free';

/** PR 353: one card of the free-access catalog (`GET /checklists/free`) -- never carries the criteria. */
export type FreeChecklistSummary = {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  pinned: boolean;
  // PR 355 -- cover image timestamp (null/absent: none). The storage key never reaches the client.
  coverUpdatedAt?: string | null;
  activeInstanceId: string | null;
  activeInstanceStatus: ChecklistInstanceStatus | null;
};

export type ChecklistBulkAction = 'archive' | 'draft' | 'publish' | 'delete' | 'move';
export type ChecklistBulkSkipReason = 'not_found' | 'forbidden' | 'already_in_status' | 'already_in_folder' | 'has_active_assignments' | 'cannot_publish' | 'moved_to_draft';
export type ChecklistBulkOutcome =
  | { id: string; result: 'done' }
  | { id: string; result: 'skipped'; reason: ChecklistBulkSkipReason; message?: string };
export type ChecklistBulkResult = { action: ChecklistBulkAction; done: number; skipped: number; results: ChecklistBulkOutcome[] };

/** PR 395/396: one folder of the checklist tree as `GET /checklist-folders` returns it (only the folders the caller may see). */
export type ChecklistFolder = {
  id: string;
  parentId: string | null;
  name: string;
  /** Open to every role except the learner; a closed folder shows a lock in the tree. */
  visibleToStaff: boolean;
  createdBy: string | null;
  createdAt: string;
  /** The caller is the administrator or the creator: may rename, move, open to staff and delete. */
  canManage: boolean;
  checklistCount: number;
  totalChecklistCount: number;
};
export type ChecklistFolderList = { folders: ChecklistFolder[]; checklistCount: number };
export type ChecklistFolderDeleteImpact = { folders: number; checklists: number; movedToDraft: Array<{ id: string; title: string }> };

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
  // PR 330 strictness settings -- optional because older payloads never carried them (read as false).
  allowFinishIncomplete?: boolean;
  forbidGalleryPhotos?: boolean;
  // PR 368 -- optional too: older payloads read as feedback on, optional, no sheet-level skip.
  feedbackEnabled?: boolean;
  feedbackRequired?: boolean;
  allowSkipAll?: boolean;
  // PR 353 -- optional because older payloads never carried it (read as 'assigned').
  accessMode?: ChecklistAccessMode;
  // PR 354 -- optional for the same reason (read as false).
  pinned?: boolean;
  // PR 362в -- optional because older payloads never carried it (read as true: everyone may edit).
  allowEditByAll?: boolean;
  // PR 355 -- optional for the same reason (read as no cover).
  coverUpdatedAt?: string | null;
  itemGroups?: ChecklistItemGroup[];
  createdBy: string | null;
  // PR 393 -- only `GET /checklists` carries the author's name (null: author deleted); optional elsewhere.
  creator?: { id: string; firstName: string; lastName: string } | null;
  // PR 395 -- the folder the sheet lives in (null/absent: the root).
  folderId?: string | null;
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
  /** PR 369б: highlight colour `#RRGGBB`. The scale API always resolves it; a snapshot taken earlier has none. */
  color?: string;
};

export type ChecklistScaleSummary = {
  id: string;
  organizationId: string;
  name: string;
  status: ChecklistScaleStatus;
  levels: ChecklistScaleLevelSummary[];
  /** PR 344: the organization's protected Yes/No scale -- cannot be edited, archived or deleted (copy it instead). */
  isDefault: boolean;
  /** PR 343: used by an assigned checklist (PR 369: still editable; sessions already started keep their own copy). */
  inUse: boolean;
};

export type ChecklistItemResultAnswerState = 'unanswered' | 'answered' | 'skipped';

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
  // PR 322: already selected/returned by the API (checklists.service.ts's
  // `instanceWithResultsSelect`) but never typed on the frontend -- the session report's criteria
  // tab needs it to tell an explicit "not done" (answered, checked false) apart from "skipped"
  // (skipChecklistItem, or auto-skipped on completion), which `checked`/`scaleLevel` alone cannot.
  answerState?: ChecklistItemResultAnswerState;
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
export type ChecklistFeedbackVisibility = 'after_completion' | 'live';

// ---- Workplace-training module settings (PR 286) ----
// criticalThreshold is intentionally omitted here even though the API returns it -- DEC-CHKS-001
// (docs/status/OPEN_DECISIONS.md) leaves what counts as a "critical" result undecided. lowThreshold
// (PR 350) is editable; null means the owner has not set it.
export type ChecklistObserverEligibility = 'any_user' | 'selected_roles' | 'selected_users';

export type ChecklistWorkplaceSettingsView = {
  organizationId: string;
  moduleEnabled: boolean;
  highPerformanceThreshold: number;
  lowThreshold: number | null;
  /** PR 369б: highlight colours (`#RRGGBB`) of the results below the low threshold, between the thresholds and from the high one. */
  resultColors: { low: string; mid: string; high: string };
  defaultGeolocationPolicy: ChecklistGeolocationPolicy;
  feedbackVisibility: ChecklistFeedbackVisibility;
  observerEligibility: ChecklistObserverEligibility;
  observerRoles: UserRole[];
  observerUserIds: string[];
  selectedObserverUsers?: Array<Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'status'>>;
  updatedAt: string | null;
};

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
  durationMinutes: number | null;
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
  contextFieldsSnapshot?: ContextField[] | null;
  contextValues?: Record<string, string> | null;
  // PR 302: an orthogonal business flag (not a lifecycle status) -- non-null reason means the
  // assigned observer reported they can't conduct this session; reassigning the observer clears it.
  observerUnavailableReason: string | null;
  observerUnavailableAt: string | null;
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

/** PR 370/371: colours arrive ready from the server; the client never derives them. */
export type ChecklistReportHighlight = {
  color: string;
  light: { fill: string; text: string };
  dark: { fill: string; text: string };
};

export type ChecklistReportPerson = {
  id: string; firstName: string; lastName: string; email: string;
  department: { id: string; name: string } | null;
};

export type ChecklistSessionReport = {
  sessionId: string;
  instanceId: string;
  checklist: { id: string; title: string };
  visible: boolean;
  header: {
    status: ChecklistSessionStatus;
    timezone: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    startedAt: string | null;
    completedAt: string | null;
    learner: ChecklistReportPerson;
    observer: ChecklistReportPerson;
  };
  generalInfo: Array<{ id: string; label: string; type: string; value: string | null }>;
  summary: null | {
    scored: boolean;
    percentage: number | null;
    totalScore: number;
    maxScore: number;
    criteriaCount: number;
    answeredCount: number;
    skippedCount: number;
    passed: boolean | null;
    passThreshold: number | null;
    formula: ChecklistScoreFormula;
    color: ChecklistReportHighlight | null;
  };
  groups: Array<{
    id: string | null; number: string; title: string; score: number; maxScore: number;
    percentage: number | null; criteriaCount: number; color: ChecklistReportHighlight | null;
  }>;
  criteria: Array<{
    id: string; number: string; groupId: string | null; text: string; state: 'answered' | 'skipped' | 'unanswered' | string;
    score: number | null; maxScore: number | null; levelLabel: string | null; comment: string | null;
    photo: { fileName: string | null } | null; reviewStatus: string | null; color: ChecklistReportHighlight | null;
  }>;
  feedback: null | { strengths: string | null; developmentAreas: string | null; comment: string | null };
  location: { policy: ChecklistGeolocationPolicy; captures: Array<{ capturePoint: string; status: string; capturedAt: string }> };
};

export type ChecklistSessionQuery = {
  status?: ChecklistSessionStatus;
  observerId?: string;
  checklistId?: string;
  learnerId?: string;
  departmentId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  search?: string;
  overdueOnly?: 'true' | 'false';
  sort?: 'scheduled' | 'recent';
  excludeSessionId?: string;
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
  durationMinutes?: number | null;
  locationCapturePolicy?: ChecklistGeolocationPolicy;
  timezone?: string;
  idempotencyKey?: string;
};

export type BulkCreateChecklistSessionInput = {
  checklistId: string;
  learnerIds: string[];
  observerId: string;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  schedules?: ChecklistSessionRecipientSchedule[];
  locationCapturePolicy?: ChecklistGeolocationPolicy;
  timezone?: string;
};

export type ChecklistSessionRecipientSchedule = {
  learnerId: string;
  scheduledAt: string;
  durationMinutes?: number | null;
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
  durationMinutes?: number | null;
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
  durationMinutes: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  locationCapturePolicy: ChecklistGeolocationPolicy;
  timezone: string;
  overdue: boolean;
  strengths: string | null;
  developmentAreas: string | null;
  nextSteps: string | null;
  contextFieldsSnapshot?: ContextField[] | null;
  contextValues?: Record<string, string> | null;
  observerUnavailableReason: string | null;
  observerUnavailableAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// PR 302: an orthogonal business flag, not a lifecycle transition -- `version` is the same
// optimistic-concurrency contract as every other session mutation.
export type MarkChecklistSessionObserverUnavailableInput = {
  reason: string;
  version: number;
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

export type SubmitChecklistSessionContextInput = {
  values: Record<string, string>;
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
  | 'feedback_updated'
  | 'score_recalculated'
  | 'observer_marked_unavailable';

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

// ---- Score revisions (PR 300 admin session report + auditable recalculate) ----

export type ChecklistScoreFormula = 'snapshot' | 'criteria';

export type ChecklistScoreRevision = {
  formula: ChecklistScoreFormula;
  newScored: boolean;
  id: string;
  organizationId: string;
  instanceId: string;
  previousPercentage: number;
  newPercentage: number;
  previousPassed: boolean;
  newPassed: boolean;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
};

export type RecalculateChecklistScoreInput = { reason: string; formula?: ChecklistScoreFormula; idempotencyKey?: string };

// POST keeps the historical scored alias; revisions persist the same fact as newScored.
export type RecalculateChecklistScoreResult = ChecklistScoreRevision & { scored: boolean };

/** PR 373: server-calculated and authorized summary table, shared by CSV and styled XLSX. */
export type ChecklistSessionSummaryExport = {
  filename: string; csv: string; rows: (string | number)[][]; rowCount: number; sessionIds: string[];
  layout: {
    sheetName: string; headerRows: number[]; columnWidths: number[]; freezeRows: number;
    merges: { startRow: number; startColumn: number; endRow: number; endColumn: number }[];
  };
};
