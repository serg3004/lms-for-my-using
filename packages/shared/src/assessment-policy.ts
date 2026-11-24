import { z } from 'zod';

export const attemptPolicySchema = z.enum(['best', 'latest', 'average']);
export const assessmentPolicySchema = z.object({
  opensAt: z.iso.datetime().nullable().optional(),
  closesAt: z.iso.datetime().nullable().optional(),
  cooldownHours: z.number().int().min(0).max(2147483647).optional(),
  attemptPolicy: attemptPolicySchema.optional(),
  answerVisibility: z.enum(['never', 'submitted', 'last']).optional(),
  showFeedback: z.boolean().optional(),
  incorrectAnswer: z.enum(['never', 'immediate', 'review']).optional(),
  oneQuestion: z.boolean().optional(),
  preventBacktracking: z.boolean().optional(),
}).strict().refine(({ opensAt, closesAt }) => !opensAt || !closesAt || Date.parse(opensAt) < Date.parse(closesAt));

export type AssessmentPolicy = z.infer<typeof assessmentPolicySchema>;
export type AttemptPolicy = z.infer<typeof attemptPolicySchema>;
export type EffectiveAssessmentResult = { policy: AttemptPolicy; attemptId: string; percentage: number; passed: boolean };

export function requiresLockedAnswers(policy?: AssessmentPolicy | null) {
  return Boolean(policy?.preventBacktracking || policy?.incorrectAnswer === 'immediate');
}
