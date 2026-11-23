import type { Prisma } from '@prisma/client';

export function assessmentCourseScope(organizationId: string, instructorId?: string): Prisma.AssessmentWhereInput {
  return instructorId ? {
    course: { organizationId, deletedAt: null, instructors: { some: { instructorId, organizationId, deletedAt: null } } },
  } : {};
}
