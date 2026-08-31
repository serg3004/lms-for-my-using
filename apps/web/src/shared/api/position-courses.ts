import { apiRequest } from '../apiClient.js';

export type PositionCourseRequirement = 'REQUIRED' | 'OPTIONAL';
export type PositionCourseStatus = 'active' | 'archived';

export type PositionCourse = {
  id: string;
  organizationId: string;
  positionId: string;
  courseId: string;
  requirement: PositionCourseRequirement;
  dueDays: number | null;
  status: PositionCourseStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePositionCoursePayload = {
  organizationId: string;
  positionId: string;
  courseId: string;
  requirement?: PositionCourseRequirement;
  dueDays?: number;
};

export type UpdatePositionCoursePayload = Partial<{ requirement: PositionCourseRequirement; dueDays: number | null }>;

function listQuery(params: { positionId?: string; courseId?: string; status?: PositionCourseStatus }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return qs ? `?${qs}` : '';
}

export function listPositionCourses(params: { positionId?: string; courseId?: string; status?: PositionCourseStatus } = {}) {
  return apiRequest<PositionCourse[]>(`/position-courses${listQuery(params)}`);
}

export function getPositionCourse(id: string) {
  return apiRequest<PositionCourse>(`/position-courses/${encodeURIComponent(id)}`);
}

export function createPositionCourse(payload: CreatePositionCoursePayload) {
  return apiRequest<PositionCourse>('/position-courses', { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePositionCourse(id: string, payload: UpdatePositionCoursePayload) {
  return apiRequest<PositionCourse>(`/position-courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function archivePositionCourse(id: string) {
  return apiRequest<PositionCourse>(`/position-courses/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export function restorePositionCourse(id: string) {
  return apiRequest<PositionCourse>(`/position-courses/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}
