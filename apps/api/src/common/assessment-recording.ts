import type { Prisma } from '@prisma/client';

export function buildAttemptResultNotification(assessmentTitle: string, assessmentId: string, passed: boolean, percentage: number) {
  return { type: passed ? 'assessment_passed' : 'assessment_failed', data: { assessmentTitle, percentage }, link: `/learn/assessments/${assessmentId}` };
}

/** The same persisted attempt/certificate/notification contract for standalone and longread tests. */
export async function recordCompletedAssessment(tx: Prisma.TransactionClient, data: Prisma.AssessmentAttemptUncheckedCreateInput,
  answers: Omit<Prisma.AssessmentAttemptAnswerCreateManyInput, 'attemptId' | 'organizationId'>[], courseId: string, title: string, existingId?: string) {
  const attempt = existingId
    ? await tx.assessmentAttempt.update({ where: { id: existingId, organizationId: data.organizationId }, data: { score: data.score, maxScore: data.maxScore, percentage: data.percentage, passed: data.passed, completedAt: data.completedAt, status: 'completed' }, select: { id: true } })
    : await tx.assessmentAttempt.create({ data, select: { id: true } });
  await tx.assessmentAttemptAnswer.createMany({ data: answers.map((answer) => ({ ...answer, organizationId: data.organizationId, attemptId: attempt.id })) });
  if (data.countsTowardResults !== false) {
    if (data.passed) await tx.certificate.upsert({
      where: { organizationId_courseId_userId: { organizationId: data.organizationId, courseId, userId: data.userId } },
      update: { assessmentAttemptId: attempt.id, status: 'issued', revokedAt: null },
      create: { organizationId: data.organizationId, courseId, userId: data.userId, assessmentAttemptId: attempt.id },
    });
    const notification = buildAttemptResultNotification(title, data.assessmentId, !!data.passed, data.percentage ?? 0);
    await tx.notification.create({ data: { organizationId: data.organizationId, userId: data.userId, ...notification } });
  }
  return attempt.id;
}
