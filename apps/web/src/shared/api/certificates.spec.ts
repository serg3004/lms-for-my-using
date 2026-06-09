import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
      this.name = 'ApiClientError';
    }
  },
}));

vi.mock('../apiClient.js', () => mocks);

import { getCertificatePath, issueCertificate } from './certificates.js';

describe('certificates api paths', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
  });

  it('builds certificate detail path for a regular id', () => {
    expect(getCertificatePath('certificate-1')).toBe('/certificates/certificate-1');
  });

  it('encodes certificate ids before adding them to the path', () => {
    expect(getCertificatePath('certificate 1/2')).toBe('/certificates/certificate%201%2F2');
  });

  it('reads the auto-issued certificate instead of posting learner certificate creation', async () => {
    mocks.apiRequest.mockResolvedValueOnce([
      { id: 'certificate-1', assessmentAttemptId: 'attempt-1' },
      { id: 'certificate-2', assessmentAttemptId: 'attempt-2' },
    ]);

    await expect(
      issueCertificate({
        organizationId: 'organization-1',
        courseId: 'course-1',
        userId: 'learner-1',
        assessmentAttemptId: 'attempt-2',
      }),
    ).resolves.toMatchObject({ id: 'certificate-2' });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/certificates');
  });

  it('fails when an auto-issued certificate is not available yet', async () => {
    mocks.apiRequest.mockResolvedValueOnce([]);

    await expect(
      issueCertificate({
        organizationId: 'organization-1',
        courseId: 'course-1',
        userId: 'learner-1',
        assessmentAttemptId: 'attempt-1',
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/certificates');
  });
});
