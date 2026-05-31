const apiBasePath = '/api/v1';
const csrfTokenCookieName = 'lms_csrf_token';
const csrfHeaderName = 'x-csrf-token';
const unsafeMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

type LoginInput = {
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

type CreateLessonCompletionInput = {
  organizationId: string;
  courseId: string;
  lessonId: string;
  userId: string;
};

type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: CurrentUser;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
  message?: string;
};

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') {
    return 'Request failed';
  }

  const errorBody = body as ApiErrorResponse;

  return errorBody.error?.message ?? errorBody.message ?? 'Request failed';
}

function getCookieValue(cookieName: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookiePrefix = `${cookieName}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));

  return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : null;
}

function shouldAttachCsrfHeader(method: string | undefined) {
  return unsafeMethods.has((method ?? 'GET').toUpperCase());
}

function buildHeaders(init: RequestInit) {
  const hasBody = Boolean(init.body);
  const headers = new Headers(init.headers);

  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (shouldAttachCsrfHeader(init.method) && !headers.has(csrfHeaderName)) {
    const csrfToken = getCookieValue(csrfTokenCookieName);

    if (csrfToken) {
      headers.set(csrfHeaderName, csrfToken);
    }
  }

  return headers;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

export async function apiRequest<TResponse>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBasePath}${path}`, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers: buildHeaders(init),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiClientError(getErrorMessage(body), response.status);
  }

  return body as TResponse;
}

export async function login(input: LoginInput) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCurrentUser() {
  return apiRequest<CurrentUser>('/auth/me');
}

export function listCourses() {
  return apiRequest<CourseSummary[]>('/courses');
}

export function getCourse(courseId: string) {
  return apiRequest<CourseSummary>(`/courses/${encodeURIComponent(courseId)}`);
}

export function listLessons(courseId: string) {
  return apiRequest<LessonSummary[]>(`/courses/${encodeURIComponent(courseId)}/lessons`);
}

export function getLesson(lessonId: string) {
  return apiRequest<LessonSummary>(`/lessons/${encodeURIComponent(lessonId)}`);
}

export function listCourseMaterials(courseId: string) {
  return apiRequest<CourseMaterialSummary[]>(`/courses/${encodeURIComponent(courseId)}/materials`);
}

export function listProgress() {
  return apiRequest<ProgressSummary[]>('/progress');
}

export function markLessonCompleted(input: CreateLessonCompletionInput) {
  return apiRequest<ProgressSummary>('/progress', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      status: 'completed',
      completedAt: new Date().toISOString(),
    }),
  });
}

export function listAssignments() {
  return apiRequest<AssignmentSummary[]>('/assignments');
}

export function getAssignment(assignmentId: string) {
  return apiRequest<AssignmentSummary>(`/assignments/${encodeURIComponent(assignmentId)}`);
}

export function listAssessments() {
  return apiRequest<AssessmentSummary[]>('/assessments');
}

export function getAssessment(assessmentId: string) {
  return apiRequest<AssessmentSummary>(`/assessments/${encodeURIComponent(assessmentId)}`);
}

export function listCertificates() {
  return apiRequest<CertificateSummary[]>('/certificates');
}

export function getCertificate(certificateId: string) {
  return apiRequest<CertificateSummary>(`/certificates/${encodeURIComponent(certificateId)}`);
}
