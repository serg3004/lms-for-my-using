import { apiRequest } from '../apiClient.js';

import type { CourseSummary } from './types.js';

const coursesPath = '/courses';

export function getCoursePath(courseId: string) {
  return `${coursesPath}/${encodeURIComponent(courseId)}`;
}

export function listCourses() {
  return apiRequest<CourseSummary[]>(coursesPath);
}

export function getCourse(courseId: string) {
  return apiRequest<CourseSummary>(getCoursePath(courseId));
}

export type CreateCourseInput = {
  organizationId: string;
  title: string;
  description?: string;
  status?: string;
};

export type UpdateCourseInput = {
  title?: string;
  description?: string;
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
