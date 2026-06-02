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
