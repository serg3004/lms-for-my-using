import { z } from 'zod';

export const courseMaterialStatusSchema = z.enum(['active', 'archived']);
export const courseMaterialKindSchema = z.enum(['file', 'link']);

const materialSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createCourseMaterialSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  slug: materialSlugSchema,
  description: z.string().trim().max(1000).optional(),
  kind: courseMaterialKindSchema.default('file'),
  fileName: z.string().trim().min(1).max(255).optional(),
  fileUrl: z.string().trim().url().max(2048),
  mimeType: z.string().trim().min(1).max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  status: courseMaterialStatusSchema.default('active'),
});

export type CreateCourseMaterialInput = z.infer<typeof createCourseMaterialSchema>;

export const updateCourseMaterialStatusSchema = z.object({
  status: courseMaterialStatusSchema,
});
export type UpdateCourseMaterialStatusInput = z.infer<typeof updateCourseMaterialStatusSchema>;

export const updateCourseMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable(),
    kind: courseMaterialKindSchema,
    fileName: z.string().trim().max(255).nullable(),
    fileUrl: z.string().trim().url().max(2048),
    status: courseMaterialStatusSchema,
  })
  .partial();
export type UpdateCourseMaterialInput = z.infer<typeof updateCourseMaterialSchema>;
