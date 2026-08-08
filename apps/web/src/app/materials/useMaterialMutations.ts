import { apiRequest } from '../../shared/apiClient.js';

export type MaterialMutationResult = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  kind: 'file' | 'link';
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
};

export function useMaterialMutations() {
  return {
    create: (courseId: string, body: unknown) => apiRequest<MaterialMutationResult>(`/courses/${encodeURIComponent(courseId)}/materials`, {
      method: 'POST', body: JSON.stringify(body),
    }),
    update: (materialId: string, body: unknown) => apiRequest<MaterialMutationResult>(`/materials/${encodeURIComponent(materialId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
    updateStatus: (materialId: string, status: string) => apiRequest<MaterialMutationResult>(`/materials/${encodeURIComponent(materialId)}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),
  };
}
