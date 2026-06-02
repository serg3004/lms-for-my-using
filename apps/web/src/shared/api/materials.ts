import { apiRequest } from '../apiClient.js';

import type { CourseMaterialSummary } from './types.js';

export function getCourseMaterialsPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}/materials`;
}

export function listCourseMaterials(courseId: string) {
  return apiRequest<CourseMaterialSummary[]>(getCourseMaterialsPath(courseId));
}
