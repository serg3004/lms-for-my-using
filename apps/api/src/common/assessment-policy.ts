import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assessmentPolicySchema, type AssessmentPolicy, type AttemptPolicy, type EffectiveAssessmentResult } from '@lms/shared/assessment-policy';

export function readAssessmentPolicy(value: unknown): AssessmentPolicy {
  const parsed = assessmentPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function assertAssessmentWindow(policy: AssessmentPolicy, now = Date.now()) {
  if (policy.opensAt && now < Date.parse(policy.opensAt)) throw new BadRequestException('Assessment is not open yet');
  if (policy.closesAt && now >= Date.parse(policy.closesAt)) throw new BadRequestException('Assessment availability has ended');
}

export type AttemptScore = { id: string; percentage: number; passed: boolean };

export function effectiveAssessmentResult(policy: AttemptPolicy, latestFirst: AttemptScore[], passingScore: number): EffectiveAssessmentResult | undefined {
  const latest = latestFirst[0];
  if (!latest) return;
  const selected = policy === 'best'
    ? latestFirst.reduce((best, candidate) => candidate.percentage > best.percentage ? candidate : best, latest)
    : latest;
  const percentage = policy === 'average'
    ? Math.round(latestFirst.reduce((sum, attempt) => sum + attempt.percentage, 0) / latestFirst.length)
    : selected.percentage;
  return { policy, attemptId: selected.id, percentage, passed: policy === 'average' ? percentage >= passingScore : selected.passed };
}

export function completedAssessmentAttempts(where: Prisma.AssessmentAttemptWhereInput) {
  return { ...where, status: 'completed' as const, countsTowardResults: true, deletedAt: null };
}

export const assessmentAttemptOrder = [{ completedAt: 'desc' }, { id: 'desc' }] satisfies Prisma.AssessmentAttemptOrderByWithRelationInput[];
