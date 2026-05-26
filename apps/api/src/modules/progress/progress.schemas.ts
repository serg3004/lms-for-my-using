import { z } from 'zod';

export const progressStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

export const createProgressSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  status: progressStatusSchema.default('in_progress'),
  score: z.number().int().min(0).max(100).optional(),
  completedAt: z.coerce.date().optional(),
});

export type CreateProgressInput = z.infer<typeof createProgressSchema>;
