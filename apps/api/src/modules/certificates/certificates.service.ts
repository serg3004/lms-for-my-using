import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { UserRole } from '../auth/roles.js';
import type { IssueCertificateInput } from './certificates.schemas.js';

const privilegedCertificateRoles: UserRole[] = ['admin', 'manager', 'instructor'];

const certificateSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  userId: true,
  assessmentAttemptId: true,
  status: true,
  issuedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
    },
  },
  course: {
    select: {
      id: true,
      title: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

type CertificateRow = {
  id: string;
  organizationId: string;
  courseId: string;
  userId: string;
  assessmentAttemptId: string | null;
  status: string;
  issuedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organization?: {
    id: string;
    name: string;
  };
  course?: {
    id: string;
    title: string;
  };
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

type CertificatePrisma = PrismaService & {
  certificate: {
    findMany(args: unknown): Promise<CertificateRow[]>;
    findFirst(args: unknown): Promise<CertificateRow | null>;
    create(args: unknown): Promise<CertificateRow>;
  };
};

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCertificates(currentUserId: string, organizationId: string) {
    return this.certificatesPrisma.certificate.findMany({
      where: {
        organizationId,
        userId: currentUserId,
        deletedAt: null,
      },
      orderBy: { issuedAt: 'desc' },
      select: certificateSelect,
    });
  }

  async getCertificate(certificateId: string, currentUserId: string, organizationId: string) {
    const certificate = await this.certificatesPrisma.certificate.findFirst({
      where: {
        id: certificateId,
        organizationId,
        deletedAt: null,
      },
      select: certificateSelect,
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    await this.ensureCertificateAccess(certificate.userId, currentUserId, organizationId);

    return certificate;
  }

  async issueCertificate(input: IssueCertificateInput, currentUserId: string) {
    await this.ensureCertificateAccess(input.userId, currentUserId, input.organizationId);
    await this.ensureCourseExists(input.courseId, input.organizationId);
    await this.ensureUserExists(input.userId, input.organizationId);

    const existingCertificate = await this.certificatesPrisma.certificate.findFirst({
      where: {
        organizationId: input.organizationId,
        courseId: input.courseId,
        userId: input.userId,
        deletedAt: null,
      },
      select: certificateSelect,
    });

    if (existingCertificate) {
      return existingCertificate;
    }

    const assessmentAttemptId = await this.findPassedAssessmentAttemptId(input);
    const isCourseCompleted = await this.isCourseCompleted(input.courseId, input.userId, input.organizationId);

    if (!isCourseCompleted && !assessmentAttemptId) {
      throw new ForbiddenException('Certificate is not available before course completion or passed assessment');
    }

    return this.certificatesPrisma.certificate.create({
      data: {
        organizationId: input.organizationId,
        courseId: input.courseId,
        userId: input.userId,
        assessmentAttemptId,
      },
      select: certificateSelect,
    });
  }

  private get certificatesPrisma() {
    return this.prisma as CertificatePrisma;
  }

  private async ensureCourseExists(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureCertificateAccess(targetUserId: string, currentUserId: string, organizationId: string) {
    if (targetUserId === currentUserId) {
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: currentUserId,
        organizationId,
        role: { in: privilegedCertificateRoles },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Certificate is not available for current user');
    }
  }

  private async isCourseCompleted(courseId: string, userId: string, organizationId: string) {
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({
        where: {
          courseId,
          organizationId,
          deletedAt: null,
          status: 'published',
        },
      }),
      this.prisma.progress.count({
        where: {
          courseId,
          userId,
          organizationId,
          deletedAt: null,
          status: 'completed',
          lessonId: { not: null },
          lesson: {
            status: 'published',
            deletedAt: null,
          },
        },
      }),
    ]);

    return totalLessons > 0 && completedLessons >= totalLessons;
  }

  private async findPassedAssessmentAttemptId(input: IssueCertificateInput) {
    const assessmentAttempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: input.assessmentAttemptId,
        organizationId: input.organizationId,
        userId: input.userId,
        passed: true,
        deletedAt: null,
        assessment: {
          courseId: input.courseId,
          deletedAt: null,
        },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    return assessmentAttempt?.id ?? null;
  }
}
