import { z } from 'zod';

export const checklistStatusSchema = z.enum(['draft', 'published', 'archived']);
export const checklistScoringModeSchema = z.enum(['sum_points', 'all_required', 'scale']);
export const checklistInstanceStatusSchema = z.enum(['assigned', 'in_progress', 'submitted', 'completed', 'expired']);
export const checklistReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const scaleLevelSchema = z.object({
  level: z.number().int().min(1),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  points: z.number().int().min(0),
});
export type ScaleLevel = z.infer<typeof scaleLevelSchema>;

export const createChecklistSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scoringMode: checklistScoringModeSchema.default('sum_points'),
  passThreshold: z.number().int().min(0).max(100).default(80),
  scaleLevels: z.array(scaleLevelSchema).max(20).optional(),
  requiresReview: z.boolean().default(false),
});
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;

export const updateChecklistSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    status: checklistStatusSchema,
    scoringMode: checklistScoringModeSchema,
    passThreshold: z.number().int().min(0).max(100),
    scaleLevels: z.array(scaleLevelSchema).max(20).nullable(),
    requiresReview: z.boolean(),
  })
  .partial();
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  points: z.number().int().min(0).max(1000).default(0),
  isRequired: z.boolean().default(true),
  photoRequired: z.boolean().default(false),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

export const updateChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    points: z.number().int().min(0).max(1000),
    isRequired: z.boolean(),
    photoRequired: z.boolean(),
    order: z.number().int().min(0),
  })
  .partial();
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

export const assignChecklistSchema = z.object({
  userId: z.string().uuid(),
  dueAt: z.string().datetime().optional(),
});
export type AssignChecklistInput = z.infer<typeof assignChecklistSchema>;

export const submitChecklistItemResultSchema = z
  .object({
    checked: z.boolean(),
    scaleLevel: z.number().int().min(1),
    photoUrl: z.string().trim().url().max(2000),
    comment: z.string().trim().max(1000),
  })
  .partial();
export type SubmitChecklistItemResultInput = z.infer<typeof submitChecklistItemResultSchema>;

export const reviewChecklistItemResultSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(1000).optional(),
});
export type ReviewChecklistItemResultInput = z.infer<typeof reviewChecklistItemResultSchema>;
