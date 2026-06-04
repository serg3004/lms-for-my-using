import { apiRequest } from '../apiClient.js';

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

export function issueCertificate(input: {
  organizationId: string;
  courseId: string;
  userId: string;
  assessmentAttemptId?: string;
}) {
  return apiRequest<CertificateSummary>(certificatesPath, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
