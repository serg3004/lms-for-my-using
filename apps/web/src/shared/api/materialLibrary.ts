import { apiRequest } from '../apiClient.js';

/** PR 582: a material of the library: it may belong to no course and be connected to several. */
export type LibraryMaterial = {
  id: string;
  title: string;
  kind: 'file' | 'link';
  fileUrl: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  status: string;
  courseId: string | null;
  folderId: string | null;
  usedIn: { courseId: string; courseTitle: string }[];
};

export type MaterialPlace = { courseId: string; courseTitle: string; lessonId: string | null; lessonTitle: string | null; own: boolean };

export function listMaterialLibrary(folderId?: string | 'root') {
  return apiRequest<LibraryMaterial[]>(`/material-library${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`);
}

export function createLibraryMaterial(input: { title: string; kind: 'file' | 'link'; fileUrl?: string; folderId?: string | null }) {
  return apiRequest<LibraryMaterial>('/material-library', { method: 'POST', body: JSON.stringify(input) });
}

export function getMaterialUsage(materialId: string) {
  return apiRequest<{ places: MaterialPlace[] }>(`/materials/${encodeURIComponent(materialId)}/usage`);
}

export function connectMaterial(courseId: string, materialId: string, lessonId: string | null) {
  return apiRequest<unknown>(`/courses/${encodeURIComponent(courseId)}/materials/connect`, { method: 'POST', body: JSON.stringify({ materialId, lessonId }) });
}

export function disconnectMaterial(courseId: string, materialId: string) {
  return apiRequest<unknown>(`/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/connection`, { method: 'DELETE' });
}
