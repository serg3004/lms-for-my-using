import { apiRequest } from '../apiClient.js';

import type { CourseMaterialSummary } from './types.js';

export function getCourseMaterialsPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}/materials`;
}

export function listCourseMaterials(courseId: string) {
  return apiRequest<CourseMaterialSummary[]>(getCourseMaterialsPath(courseId));
}

export function getMaterialDownloadUrl(materialId: string) {
  return apiRequest<{ url: string; expiresIn: number | null }>(
    `/materials/${encodeURIComponent(materialId)}/download`,
  );
}
