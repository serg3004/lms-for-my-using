import type { EffectiveAssessmentResult } from '@lms/shared/assessment-policy';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function buildAttemptResultNotification(assessmentTitle: string, assessmentId: string, passed: boolean, percentage: number) {
  return { type: passed ? 'assessment_passed' : 'assessment_failed', data: { assessmentTitle, percentage }, link: `/learn/assessments/${assessmentId}` };
}

/** The same persisted attempt/certificate/notification contract for standalone and longread tests. */
export async function recordCompletedAssessment(tx: Prisma.TransactionClient, data: Prisma.AssessmentAttemptUncheckedCreateInput,
  answers: Omit<Prisma.AssessmentAttemptAnswerCreateManyInput, 'attemptId' | 'organizationId'>[], courseId: string | null, title: string, existingId?: string,
  effective?: () => Promise<EffectiveAssessmentResult | undefined>, survey = false) {
  if (answers.some((answer) => answer.reviewPending)) {
    data = { ...data, status: 'pending_review', score: 0, percentage: 0, passed: false };
  }
  if (existingId && data.status === 'pending_review') {
    const claim = await tx.assessmentAttempt.updateMany({
      where: { id: existingId, organizationId: data.organizationId, status: 'in_progress' },
      data: { status: 'pending_review' },
    });
    if (!claim.count) throw new ConflictException('Attempt was already submitted');
  }
  const attempt = existingId
    ? await tx.assessmentAttempt.update({ where: { id: existingId, organizationId: data.organizationId }, data: { score: data.score, maxScore: data.maxScore, percentage: data.percentage, passed: data.passed, completedAt: data.completedAt, status: data.status, reviewPassingScore: data.reviewPassingScore }, select: { id: true } })
    : await tx.assessmentAttempt.create({ data: { ...data, courseId }, select: { id: true } });
  await tx.assessmentAttemptAnswer.createMany({ data: answers.map((answer) => ({ ...answer, organizationId: data.organizationId, attemptId: attempt.id })) });
  // PR 540: a survey has no verdict, so there is no result notification and no certificate.
  if (data.status !== 'pending_review' && !survey) await publishAssessmentResult(tx, data, attempt.id, courseId, title, effective);
  return attempt.id;
}

export async function publishAssessmentResult(tx: Prisma.TransactionClient,
  data: Pick<Prisma.AssessmentAttemptUncheckedCreateInput, 'organizationId' | 'userId' | 'assessmentId' | 'passed' | 'percentage' | 'countsTowardResults' | 'longreadRevisionId'>,
  attemptId: string, courseId: string | null, title: string, effective?: () => Promise<EffectiveAssessmentResult | undefined>,
  reviewLink?: string) {
  if (data.countsTowardResults !== false || reviewLink) {
    const result = await effective?.();
    const passed = result?.passed ?? !!data.passed;
    const assessmentAttemptId = result?.attemptId ?? attemptId;
    if (passed && courseId && data.countsTowardResults !== false) await tx.certificate.upsert({
      where: { organizationId_courseId_userId: { organizationId: data.organizationId, courseId, userId: data.userId } },
      update: { assessmentAttemptId, assessmentResult: result ?? Prisma.DbNull, status: 'issued', revokedAt: null },
      create: { organizationId: data.organizationId, courseId, userId: data.userId, assessmentAttemptId, ...(result ? { assessmentResult: result } : {}) },
    });
    const notification = buildAttemptResultNotification(title, data.assessmentId, passed, result?.percentage ?? data.percentage ?? 0);
    if (data.longreadRevisionId && data.countsTowardResults !== false) notification.link = `/learn/attempts/${attemptId}`;
    if (reviewLink) notification.link = reviewLink;
    await tx.notification.create({ data: { organizationId: data.organizationId, userId: data.userId, ...notification } });
  }
}
