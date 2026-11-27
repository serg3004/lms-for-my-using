import { z } from 'zod';
import { richTextSchema } from '@lms/shared/rich-text';

export const courseMaterialStatusSchema = z.enum(['active', 'archived']);
export const courseMaterialKindSchema = z.enum(['file', 'link']);

const materialSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createCourseMaterialSchema = z.object({
  organizationId: z.guid(),
  courseId: z.guid(),
  lessonId: z.guid().optional(),
  title: z.string().trim().min(1).max(160),
  slug: materialSlugSchema,
  description: richTextSchema(1000).optional(),
  kind: courseMaterialKindSchema.default('file'),
  fileName: z.string().trim().min(1).max(255).optional(),
  fileUrl: z.string().trim().url().max(2048).optional(),
  mimeType: z.string().trim().min(1).max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  status: courseMaterialStatusSchema.default('active'),
});

export type CreateCourseMaterialInput = z.infer<typeof createCourseMaterialSchema>;

/** PR 582: a material created in the library: no course, optional folder; the slug is generated when omitted. */
export const createLibraryMaterialSchema = createCourseMaterialSchema.omit({ organizationId: true, courseId: true, lessonId: true }).extend({
  slug: materialSlugSchema.optional(),
  folderId: z.guid().nullable().optional(),
});
export type CreateLibraryMaterialInput = z.infer<typeof createLibraryMaterialSchema>;

export const connectMaterialSchema = z.object({ materialId: z.guid(), lessonId: z.guid().nullable().optional() });

export const updateCourseMaterialStatusSchema = z.object({
  status: courseMaterialStatusSchema,
});
export type UpdateCourseMaterialStatusInput = z.infer<typeof updateCourseMaterialStatusSchema>;

export const updateCourseMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: richTextSchema(1000).nullable(),
    kind: courseMaterialKindSchema,
    fileName: z.string().trim().max(255).nullable(),
    fileUrl: z.string().trim().url().max(2048).nullable(),
    status: courseMaterialStatusSchema,
    lessonId: z.guid().nullable(),
  })
  .partial();
export type UpdateCourseMaterialInput = z.infer<typeof updateCourseMaterialSchema>;
