import { z } from 'zod';
export const continueContentSchema = z.object({ mode: z.enum(['free', 'answered', 'correct']).default('free'), minViewSeconds: z.number().int().min(0).max(86400).default(0) }).strict();
export const longreadCompletionInputSchema = z.object({ version: z.number().int().min(1), chapter: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), blockId: z.string().uuid().optional() }).strict();
export const completionReasonSchema = z.object({ code: z.enum(['unanswered', 'incorrect', 'exhausted', 'file_unavailable', 'time', 'locked', 'continue_required']), blockId: z.string().optional(), remainingSeconds: z.number().int().min(0).optional() });
export type CompletionReason = z.infer<typeof completionReasonSchema>;
export const longreadCompletionSchema = z.object({
  version: z.number().int().min(1), percentage: z.number().min(0).max(100), completed: z.boolean(), requiredCount: z.number().int(), completedCount: z.number().int(),
  chapters: z.array(z.object({ anchor: z.string(), title: z.string().optional(), required: z.boolean(), completedAt: z.string().nullable(), accessible: z.boolean(), reasons: z.array(completionReasonSchema),
    gates: z.array(z.object({ blockId: z.string(), passed: z.boolean(), reasons: z.array(completionReasonSchema) })) })),
});
export type LongreadCompletion = z.infer<typeof longreadCompletionSchema>;
export const chapterLearningSchema = z.object({ enteredAt: z.string().datetime(), completedAt: z.string().datetime().optional(), passed: z.array(z.string().uuid()).max(1000).default([]) });
export const versionLearningSchema = z.object({ chapters: z.record(chapterLearningSchema), summary: longreadCompletionSchema.optional() });
export const learningHistorySchema = z.record(versionLearningSchema);
export type VersionLearning = z.infer<typeof versionLearningSchema>;
/** Both the reader and existing admin progress reports expose this server-written projection. */
export function publicLongreadProgress<T extends { longreadReadingState?: unknown }>(row: T) {
  const { longreadReadingState, ...value } = row;
  const raw = longreadReadingState as { version?: number; learning?: unknown } | null;
  const history = learningHistorySchema.safeParse(raw?.learning);
  const summary = history.success ? history.data[String(raw?.version)]?.summary : undefined;
  return { ...value, ...(summary ? { longread: summary } : {}) };
}
