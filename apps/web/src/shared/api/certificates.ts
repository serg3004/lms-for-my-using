import { ApiClientError, apiRequest } from '../apiClient.js';

import type { CertificateSummary } from './types.js';

const certificatesPath = '/certificates';

export function getCertificatePath(certificateId: string) {
  return `${certificatesPath}/${encodeURIComponent(certificateId)}`;
}

export function listCertificates() {
  return apiRequest<CertificateSummary[]>(certificatesPath);
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
  const certificates = await listCertificates();
  const certificate = certificates.find((item) => item.assessmentAttemptId === input.assessmentAttemptId);

  if (certificate) {
    return certificate;
  }

  throw new ApiClientError('Certificate not found', 404);
}
