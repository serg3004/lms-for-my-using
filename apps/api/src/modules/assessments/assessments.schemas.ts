import { z } from 'zod';
import { richTextSchema } from '@lms/shared/rich-text';

export const assessmentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createAssessmentSchema = z.object({
  organizationId: z.guid(),
  courseId: z.guid().optional(),
  lessonId: z.guid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  description: richTextSchema(2000).optional(),
  status: assessmentStatusSchema.default('draft'),
  passingScore: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).optional(),
  timeLimitMinutes: z.number().int().min(1).optional(),
  availableAfterCourseCompletion: z.boolean().default(true),
  passMessage: richTextSchema(2000).optional(),
  failMessage: richTextSchema(2000).optional(),
  showCorrectAnswers: z.boolean().default(false),
  randomizeOrder: z.boolean().default(false),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentStatusSchema = z.object({
  status: assessmentStatusSchema,
});
export type UpdateAssessmentStatusInput = z.infer<typeof updateAssessmentStatusSchema>;

export const updateAssessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: richTextSchema(2000).nullable(),
    status: assessmentStatusSchema,
    passingScore: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).nullable(),
    timeLimitMinutes: z.number().int().min(1).nullable(),
    availableAfterCourseCompletion: z.boolean(),
    passMessage: richTextSchema(2000).nullable(),
    failMessage: richTextSchema(2000).nullable(),
    showCorrectAnswers: z.boolean(),
    randomizeOrder: z.boolean(),
  })
  .partial();
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

export const assessmentPlacementSchema = z.object({
  courseId: z.guid(),
  lessonId: z.guid().optional(),
  longreadBlockId: z.guid().optional(),
  questionId: z.guid().optional(),
}).strict().refine((input) => input.longreadBlockId ? !!(input.lessonId && input.questionId) : !input.questionId);
export type AssessmentPlacementInput = z.infer<typeof assessmentPlacementSchema>;

const folderLocation = z.guid().nullable();
export const createAssessmentFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: folderLocation.optional(),
}).strict();
export const updateAssessmentFolderSchema = createAssessmentFolderSchema.partial();
export const bulkAssessmentFolderSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), kind: z.enum(['assessment', 'folder']), ids: z.array(z.guid()).min(1).max(100), parentId: folderLocation }).strict(),
  z.object({ action: z.literal('delete'), kind: z.enum(['assessment', 'folder']), ids: z.array(z.guid()).min(1).max(100) }).strict(),
]);

export type CreateAssessmentFolderInput = z.infer<typeof createAssessmentFolderSchema>;
export type UpdateAssessmentFolderInput = z.infer<typeof updateAssessmentFolderSchema>;
export type BulkAssessmentFolderInput = z.infer<typeof bulkAssessmentFolderSchema>;
