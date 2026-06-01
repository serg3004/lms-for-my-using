import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { issueCertificateSchema } from './certificates.schemas.js';
import { CertificatesService } from './certificates.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const otherUserId = '44444444-4444-4444-4444-444444444444';

function createCertificate(overrides: Partial<{
  id: string;
  organizationId: string;
  courseId: string;
  userId: string;
  assessmentAttemptId: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'certificate-1',
    organizationId: overrides.organizationId ?? organizationId,
    courseId: overrides.courseId ?? courseId,
    userId: overrides.userId ?? userId,
    assessmentAttemptId: overrides.assessmentAttemptId ?? null,
    status: 'issued',
    issuedAt: new Date(),
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

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
  it('lists only certificates owned by the current user in the current organization', async () => {
    const certificate = createCertificate();
    const certificateFindManyCalls: unknown[] = [];
    const prisma = {
      certificate: {
        findMany: async (query: unknown) => {
          certificateFindManyCalls.push(query);

          return [certificate];
        },
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(service.listCertificates(userId, organizationId)).resolves.toEqual([certificate]);
    expect(certificateFindManyCalls).toEqual([
      {
        where: {
          organizationId,
          userId,
          deletedAt: null,
        },
        orderBy: { issuedAt: 'desc' },
        select: expect.any(Object),
      },
    ]);
  });

  it('allows users to read their own certificate', async () => {
    const certificate = createCertificate();
    const prisma = {
      membership: { findFirst: async () => null },
      certificate: {
        findFirst: async () => certificate,
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(service.getCertificate(certificate.id, userId, organizationId)).resolves.toEqual(certificate);
  });

  it('rejects learner reads for another user certificate', async () => {
    const certificate = createCertificate({ userId: otherUserId });
    const membershipFindFirstCalls: unknown[] = [];
    const prisma = {
      membership: {
        findFirst: async (query: unknown) => {
          membershipFindFirstCalls.push(query);

          return null;
        },
      },
      certificate: {
        findFirst: async () => certificate,
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(service.getCertificate(certificate.id, userId, organizationId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipFindFirstCalls).toEqual([
      {
        where: {
          userId,
          organizationId,
          role: { in: ['admin', 'manager', 'instructor'] },
        },
        select: { id: true },
      },
    ]);
  });

  it('allows privileged users to read another user certificate in the same organization', async () => {
    const certificate = createCertificate({ userId: otherUserId });
    const prisma = {
      membership: {
        findFirst: async () => ({ id: 'membership-1' }),
      },
      certificate: {
        findFirst: async () => certificate,
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(service.getCertificate(certificate.id, userId, organizationId)).resolves.toEqual(certificate);
  });

  it('issues certificate when course is completed', async () => {
    const certificate = createCertificate();
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

  it('rejects learner issuing a certificate for another user', async () => {
    const courseFindFirstCalls: unknown[] = [];
    const membershipFindFirstCalls: unknown[] = [];
    const prisma = {
      course: {
        findFirst: async (query: unknown) => {
          courseFindFirstCalls.push(query);

          return { id: courseId };
        },
      },
      membership: {
        findFirst: async (query: unknown) => {
          membershipFindFirstCalls.push(query);

          return null;
        },
      },
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
          userId: otherUserId,
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipFindFirstCalls).toHaveLength(1);
    expect(courseFindFirstCalls).toHaveLength(0);
  });

  it('allows privileged users to issue a certificate for another user in the same organization', async () => {
    const certificate = createCertificate({ userId: otherUserId });
    const certificateCreateCalls: unknown[] = [];
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: async () => ({ id: otherUserId }) },
      membership: { findFirst: async () => ({ id: 'membership-1' }) },
      lesson: { count: async () => 2 },
      progress: { count: async () => 2 },
      assessmentAttempt: { findFirst: async () => null },
      certificate: {
        findFirst: async () => null,
        create: async (query: unknown) => {
          certificateCreateCalls.push(query);

          return certificate;
        },
      },
    } as unknown as PrismaService;

    const service = new CertificatesService(prisma);

    await expect(
      service.issueCertificate(
        {
          organizationId,
          courseId,
          userId: otherUserId,
        },
        userId,
      ),
    ).resolves.toEqual(certificate);
    expect(certificateCreateCalls).toEqual([
      {
        data: {
          organizationId,
          courseId,
          userId: otherUserId,
          assessmentAttemptId: null,
        },
        select: expect.any(Object),
      },
    ]);
  });
});
