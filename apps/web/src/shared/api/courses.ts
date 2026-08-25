import { apiRequest } from '../apiClient.js';

import type { CourseSummary, InstructorCourseSummary, PaginatedResponse } from './types.js';

const coursesPath = '/courses';

export function getCoursePath(courseId: string) {
  return `${coursesPath}/${encodeURIComponent(courseId)}`;
}

export function listCourses(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<CourseSummary>>(`${coursesPath}${qs}`);
}

export function listCourseSummaries(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<InstructorCourseSummary>>(`${coursesPath}/summary${qs}`);
}

export function getCourse(courseId: string) {
  return apiRequest<CourseSummary>(getCoursePath(courseId));
}

export type CreateCourseInput = {
  organizationId: string;
  title: string;
  slug: string;
  description?: string;
  category?: string;
  durationMinutes?: number;
  status?: string;
};

export type UpdateCourseInput = {
  title?: string;
  slug?: string;
  description?: string;
  category?: string;
  durationMinutes?: number;
  status?: string;
};

export function createCourse(input: CreateCourseInput) {
  return apiRequest<CourseSummary>(coursesPath, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCourse(courseId: string, input: UpdateCourseInput) {
  return apiRequest<CourseSummary>(getCoursePath(courseId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteCourse(courseId: string) {
  return apiRequest<void>(getCoursePath(courseId), { method: 'DELETE' });
}

export type CourseInstructor = { id: string; firstName: string; lastName: string | null; email: string };

export function listCourseInstructors(courseId: string) {
  return apiRequest<CourseInstructor[]>(`${getCoursePath(courseId)}/instructors`);
}

export function addCourseInstructor(courseId: string, instructorId: string) {
  return apiRequest<CourseInstructor[]>(`${getCoursePath(courseId)}/instructors`, {
    method: 'POST',
    body: JSON.stringify({ instructorId }),
  });
}

export function removeCourseInstructor(courseId: string, instructorId: string) {
  return apiRequest<CourseInstructor[]>(`${getCoursePath(courseId)}/instructors/${encodeURIComponent(instructorId)}`, {
    method: 'DELETE',
  });
}
