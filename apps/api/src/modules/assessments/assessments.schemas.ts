import { assessmentMaterialSchema } from '@lms/shared/longread-media';
import { assessmentPolicySchema } from '@lms/shared/assessment-policy';
import { z } from 'zod';
import { assessmentAnswerSchema, questionDefinitionSchema, questionTypeSchema, scoringModeSchema } from '@lms/shared/assessment-question-types';
import { FOLDER_COLORS } from '@lms/shared/constants/folder-colors';
import { richTextSchema } from '@lms/shared/rich-text';

export const assessmentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createAssessmentSchema = z.object({
  organizationId: z.guid(),
  courseId: z.guid().optional(),
  lessonId: z.guid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  description: richTextSchema(2000).optional(), material: assessmentMaterialSchema.nullable().optional(),
  status: assessmentStatusSchema.default('draft'),
  passingScore: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  timeLimitMinutes: z.number().int().min(1).max(600).optional(),
  availableAfterCourseCompletion: z.boolean().default(true),
  passMessage: richTextSchema(2000).optional(),
  failMessage: richTextSchema(2000).optional(),
  showCorrectAnswers: z.boolean().default(false),
  randomizeOrder: z.boolean().default(false),
  policy: assessmentPolicySchema.optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentStatusSchema = z.object({
  status: assessmentStatusSchema,
});
export type UpdateAssessmentStatusInput = z.infer<typeof updateAssessmentStatusSchema>;

export const updateAssessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: richTextSchema(2000).nullable(), material: assessmentMaterialSchema.nullable().optional(),
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
  color: z.enum(FOLDER_COLORS).optional(),
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

export const assessmentLibrarySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: assessmentStatusSchema.optional(),
  courseId: z.union([z.guid(), z.literal('standalone')]).optional(),
  folderId: z.union([z.guid(), z.literal('root')]).optional(),
  mine: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  attempts: z.enum(['with', 'without']).optional(),
  sort: z.enum(['createdAt', 'title', 'course', 'status', 'questions', 'attempts', 'passRate', 'lastAttemptAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type AssessmentLibraryQuery = z.infer<typeof assessmentLibrarySchema>;

const editorOptionSchema = z.object({
  id: z.guid(),
  text: z.string().trim().max(2000).nullable(),
  imageUrl: z.string().trim().min(1).max(2000).nullable(), material: assessmentMaterialSchema.nullable().optional(),
  isCorrect: z.boolean(),
}).refine((option) => option.text || option.imageUrl || option.material);

const editorQuestionSchema = z.object({
  id: z.guid(),
  type: questionTypeSchema,
  title: z.string().trim().min(1).max(200),
  text: z.string().max(4000).nullable(),
  imageUrl: z.string().max(2000).nullable(), material: assessmentMaterialSchema.nullable().optional(),
  points: z.number().int().min(1).max(2147483647),
  definition: questionDefinitionSchema.nullable(),
  scoringMode: scoringModeSchema,
  options: z.array(editorOptionSchema),
  correctFeedback: richTextSchema(2000).nullable().optional(),
  incorrectFeedback: richTextSchema(2000).nullable().optional(),
});

export const assessmentEditorContentSchema = z.object({
  settings: updateAssessmentSchema.omit({ status: true }).required().extend({ material: assessmentMaterialSchema.nullable().optional(), policy: assessmentPolicySchema.optional() }),
  questions: z.array(editorQuestionSchema),
}).refine(({ questions }) => {
  const ids = questions.flatMap((question) => [question.id, ...question.options.map((option) => option.id)]);
  return new Set(ids).size === ids.length;
}, 'Duplicate question or option IDs');

export const saveAssessmentEditorSchema = z.object({
  revision: z.iso.datetime(),
  action: z.enum(['save', 'publish', 'archive', 'draft']),
  confirmPublished: z.boolean(),
  content: assessmentEditorContentSchema,
});

export type SaveAssessmentEditorInput = z.infer<typeof saveAssessmentEditorSchema>;

export const previewAssessmentEditorSchema = z.object({
  content: assessmentEditorContentSchema,
  answers: z.array(assessmentAnswerSchema),
  questionIds: z.array(z.guid()).min(1),
});
