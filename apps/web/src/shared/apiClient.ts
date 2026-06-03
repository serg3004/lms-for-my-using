import type { ApiErrorDetail, ApiErrorResponse } from './api/types.js';

const apiBasePath = '/api/v1';
const csrfTokenCookieName = 'lms_csrf_token';
const csrfHeaderName = 'x-csrf-token';
const unsafeMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly response: ApiErrorResponse | null;

  constructor(message: string, readonly status: number, response: ApiErrorResponse | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.response = response;
    this.code = response?.error.code ?? 'HTTP_ERROR';
    this.details = response?.error.details ?? [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.statusCode === 'number' &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    typeof value.path === 'string' &&
    typeof value.timestamp === 'string'
  );
}

function getLegacyErrorMessage(body: unknown) {
  if (!isRecord(body)) {
    return 'Request failed';
  }

  if (isRecord(body.error) && typeof body.error.message === 'string') {
    return body.error.message;
  }

  return typeof body.message === 'string' ? body.message : 'Request failed';
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
    const errorResponse = isApiErrorResponse(body) ? body : null;

    throw new ApiClientError(errorResponse?.error.message ?? getLegacyErrorMessage(body), response.status, errorResponse);
  }

  return body as TResponse;
}

export type {
  AssessmentSummary,
  AssignmentSummary,
  CertificateSummary,
  CourseMaterialSummary,
  CourseSummary,
  CreateLessonCompletionInput,
  CurrentUser,
  LessonSummary,
  LoginInput,
  LoginResponse,
  ProgressSummary,
  UserRole,
} from './api/types.js';

export { getCurrentUser, login } from './api/auth.js';
export { getCourse, getCoursePath, listCourses } from './api/courses.js';
export { getLesson, getLessonPath, listLessons, markLessonCompleted } from './api/lessons.js';
export { listCourseMaterials } from './api/materials.js';
export { listProgress } from './api/progress.js';
export { getAssignment, getAssignmentPath, listAssignments } from './api/assignments.js';
export { getAssessment, getAssessmentPath, listAssessments } from './api/assessments.js';
export { getCertificate, getCertificatePath, listCertificates } from './api/certificates.js';
