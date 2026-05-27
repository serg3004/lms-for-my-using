import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { issueCertificateSchema } from './certificates.schemas.js';
import { CertificatesService } from './certificates.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';

describe('Certificates validation', () => {
  it('accepts valid issue input', () => {
    expect(
      issueCertificateSchema.parse({
        organizationId,
        courseId,
        userId,
      }),
    ).toEqual({
      organizationId,
      courseId,
      userId,
    });
  });

  it('rejects invalid issue input', () => {
    expect(() =>
      issueCertificateSchema.parse({
        organizationId,
        courseId,
        userId: 'bad-user-id',
      }),
    ).toThrow();
  });
});

describe('CertificatesService', () => {
  it('issues certificate when course is completed', async () => {
    const certificate = {
      id: 'certificate-1',
      organizationId,
      courseId,
      userId,
      assessmentAttemptId: null,
      status: 'issued',
      issuedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: async () => ({ id: userId }) },
      membership: { findFirst: async () => null },
      lesson: { count: async () => 2 },
      progress: { count: async () => 2 },
      assessmentAttempt: { findFirst: async () => null },
      certificate: {
        findFirst: async () => null,
        create: async () => certificate,
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(
      service.issueCertificate(
        {
          organizationId,
          courseId,
          userId,
        },
        userId,
      ),
    ).resolves.toEqual(certificate);
  });

  it('rejects certificate when learner is not eligible yet', async () => {
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: async () => ({ id: userId }) },
      membership: { findFirst: async () => null },
      lesson: { count: async () => 2 },
      progress: { count: async () => 1 },
      assessmentAttempt: { findFirst: async () => null },
      certificate: {
        findFirst: async () => null,
        create: async () => ({ id: 'should-not-create' }),
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(
      service.issueCertificate(
        {
          organizationId,
          courseId,
          userId,
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
