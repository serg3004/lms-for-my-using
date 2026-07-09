import { ApiClientError, apiRequest } from '../apiClient.js';

import type { CertificateSummary, PaginatedResponse } from './types.js';

const certificatesPath = '/certificates';

export function getCertificatePath(certificateId: string) {
  return `${certificatesPath}/${encodeURIComponent(certificateId)}`;
}

export function listCertificates(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<CertificateSummary>>(`${certificatesPath}${qs}`);
}

export function getCertificate(certificateId: string) {
  return apiRequest<CertificateSummary>(getCertificatePath(certificateId));
}

export async function issueCertificate(input: {
  organizationId: string;
  courseId: string;
  userId: string;
  assessmentAttemptId?: string;
}) {
  const result = await listCertificates({ pageSize: 200 });
  const certificate = result.items.find((item: CertificateSummary) => item.assessmentAttemptId === input.assessmentAttemptId);

  if (certificate) {
    return certificate;
  }

  throw new ApiClientError('Certificate not found', 404);
}
