import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse } from '@lms/shared/types/api';

const apiBasePath = '/api/v1';
const csrfTokenCookieName = 'lms_csrf_token';
const csrfHeaderName = 'x-csrf-token';
const unsafeMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[];
  readonly response: ApiErrorResponse | null;

  constructor(
    message: string,
    readonly status: number,
    response: ApiErrorResponse | null = null,
    readonly requestId: string | null = null,
  ) {
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

  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
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

export const MAX_BUFFERED_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;

function uploadBufferedMaterialFile(
  materialId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as unknown);
        } catch {
          reject(new ApiClientError('Invalid upload response', xhr.status));
        }
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as unknown;
        const errorResponse = isApiErrorResponse(body) ? body : null;
        reject(new ApiClientError(
          errorResponse?.error.message ?? 'Upload failed',
          xhr.status,
          errorResponse,
          xhr.getResponseHeader('x-request-id'),
        ));
      } catch {
        reject(new ApiClientError('Upload failed', xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiClientError('Upload failed', 0));
    });

    xhr.open('POST', `${apiBasePath}/materials/${encodeURIComponent(materialId)}/file`);
    xhr.withCredentials = true;

    const csrfToken = getCookieValue(csrfTokenCookieName);
    if (csrfToken) {
      xhr.setRequestHeader(csrfHeaderName, csrfToken);
    }

    xhr.send(formData);
  });
}

export function uploadChecklistItemPhotoWithProgress(
  instanceId: string,
  itemId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as unknown);
        } catch {
          reject(new ApiClientError('Invalid upload response', xhr.status));
        }
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as unknown;
        const errorResponse = isApiErrorResponse(body) ? body : null;
        reject(new ApiClientError(
          errorResponse?.error.message ?? 'Upload failed',
          xhr.status,
          errorResponse,
          xhr.getResponseHeader('x-request-id'),
        ));
      } catch {
        reject(new ApiClientError('Upload failed', xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiClientError('Upload failed', 0));
    });

    xhr.open('POST', `${apiBasePath}/checklist-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/photo`);
    xhr.withCredentials = true;

    const csrfToken = getCookieValue(csrfTokenCookieName);
    if (csrfToken) {
      xhr.setRequestHeader(csrfHeaderName, csrfToken);
    }

    xhr.send(formData);
  });
}

/** Uses the buffered API for small files and direct-to-storage multipart upload for larger files. */
export function uploadMaterialFileWithProgress(
  materialId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  return file.size <= MAX_BUFFERED_UPLOAD_SIZE_BYTES
    ? uploadBufferedMaterialFile(materialId, file, onProgress)
    : uploadMaterialFileMultipart(materialId, file, onProgress);
}

type MultipartSession = {
  uploadId: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; url: string }>;
};

function uploadPresignedPart(url: string, body: Blob, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => onProgress(event.loaded));
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new ApiClientError('Upload part failed', xhr.status));
      const etag = xhr.getResponseHeader('etag');
      if (!etag) return reject(new ApiClientError('Storage did not expose the uploaded part ETag', xhr.status));
      resolve(etag);
    });
    xhr.addEventListener('error', () => reject(new ApiClientError('Upload part failed', 0)));
    xhr.open('PUT', url);
    xhr.send(body);
  });
}

/** Uploads bytes directly to object storage; only metadata and ETags pass through the API. */
export async function uploadMaterialFileMultipart(
  materialId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  const session = await apiRequest<MultipartSession>(`/materials/${materialId}/file/multipart`, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
  const loadedByPart = new Map<number, number>();
  onProgress(0);
  try {
    const parts = await Promise.all(session.parts.map(async ({ partNumber, url }) => {
      const start = (partNumber - 1) * session.partSizeBytes;
      const body = file.slice(start, Math.min(start + session.partSizeBytes, file.size));
      const etag = await uploadPresignedPart(url, body, (loaded) => {
        loadedByPart.set(partNumber, loaded);
        const totalLoaded = [...loadedByPart.values()].reduce((total, value) => total + value, 0);
        onProgress(Math.min(99, Math.round((totalLoaded / file.size) * 100)));
      });
      return { partNumber, etag };
    }));
    const material = await apiRequest(`/materials/${materialId}/file/multipart/${encodeURIComponent(session.uploadId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    });
    onProgress(100);
    return material;
  } catch (error) {
    await apiRequest(`/materials/${materialId}/file/multipart/${encodeURIComponent(session.uploadId)}`, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
let refreshRequest: Promise<boolean> | null = null;
let successfulRefreshCount = 0;

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = fetch(`${apiBasePath}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then((response) => {
        if (response.ok) successfulRefreshCount += 1;
        return response.ok;
      })
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

async function executeApiRequest(path: string, init: RequestInit, signal: AbortSignal) {
  return fetch(`${apiBasePath}${path}`, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers: buildHeaders(init),
    signal,
  });
}

export async function apiRequest<TResponse>(path: string, init: RequestInit = {}) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  const refreshCountAtRequestStart = successfulRefreshCount;

  try {
    let response = await executeApiRequest(path, init, signal);

    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
      const refreshed = successfulRefreshCount > refreshCountAtRequestStart
        ? true
        : await refreshAccessToken();

      if (refreshed) {
        response = await executeApiRequest(path, init, signal);
      }
    }

    clearTimeout(timeoutId);
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      const errorResponse = isApiErrorResponse(body) ? body : null;
      throw new ApiClientError(
        errorResponse?.error.message ?? getLegacyErrorMessage(body),
        response.status,
        errorResponse,
        response.headers.get('x-request-id'),
      );
    }

    return body as TResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (init.signal?.aborted) throw error;
      throw new ApiClientError('Request timed out', 408);
    }
    throw error;
  }
}

export type {
  MembershipSummary,
  UserSummary,
  AssessmentAttemptResult,
  AssessmentSummary,
  AssignmentSummary,
  AttemptAnswerResult,
  CertificateSummary,
  CourseMaterialSummary,
  CourseSummary,
  CreateAttemptAnswerInput,
  CreateLessonCompletionInput,
  CurrentUser,
  LessonSummary,
  LoginInput,
  LoginResponse,
  NotificationSummary,
  OrganizationSummary,
  ProgressSummary,
  UserRole,
} from './api/types.js';

export { getCurrentUser, login, updateCurrentUserPreferences } from './api/auth.js';
export { createCourse, deleteCourse, getCourse, getCoursePath, listCourses, updateCourse } from './api/courses.js';
export { getLesson, getLessonPath, listLessons, markLessonCompleted } from './api/lessons.js';
export { listCourseMaterials, getMaterialDownloadUrl } from './api/materials.js';
export { listProgress } from './api/progress.js';
export { createAssignment, getAssignment, getAssignmentPath, listAssignments } from './api/assignments.js';
export { createAssessmentAttempt, getAssessment, getAssessmentPath, getAttemptResult, listAssessments, startAssessmentAttempt } from './api/assessments.js';
export { getCertificate, getCertificatePath, getCertificatePdfPath, issueCertificate, listCertificates } from './api/certificates.js';
export { getOrganization } from './api/organizations.js';
export { getUnreadNotificationCount, listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from './api/notifications.js';
export { listMemberships } from './api/memberships.js';
export { listUsers } from './api/users.js';
