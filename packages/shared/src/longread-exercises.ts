import { z } from 'zod';
import { assessmentAnswerSchema, questionTypeSchema, questionDefinitionSchema, scoringModeSchema, publicQuestionDefinitionSchema } from './assessment-question-types.js';

export const exerciseContentSchema = z.object({
  questionId: z.string().uuid().nullable().default(null),
  mode: z.enum(['practice', 'graded']).default('practice'),
  required: z.boolean().default(true),
  weight: z.number().int().min(1).max(1000000).default(1),
  hint: z.string().max(2000).default(''),
  maxAttempts: z.number().int().min(1).max(100).default(3),
  passingScore: z.number().int().min(0).max(100).default(70),
  feedback: z.enum(['result', 'answers']).default('result'),
}).strict();
export type ExerciseContent = z.infer<typeof exerciseContentSchema>;
export const submitExerciseSchema = z.object({
  version: z.number().int().min(1),
  requestId: z.string().uuid(),
  expectedAttempt: z.number().int().min(1).max(100),
  answer: assessmentAnswerSchema,
}).strict();
export const finishLongreadTestSchema = z.object({ version: z.number().int().min(1), assessmentId: z.string().uuid() }).strict();
export const writeLongreadQuestionSchema = z.object({
  questionId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  updatedAt: z.string().datetime().optional(),
  type: questionTypeSchema,
  title: z.string().trim().min(1).max(200),
  text: z.string().max(4000).default(''),
  definition: questionDefinitionSchema.nullable().default(null),
  scoringMode: scoringModeSchema.default('all_or_nothing'),
  options: z.array(z.object({ id: z.string().uuid().optional(), text: z.string().trim().min(1).max(2000), isCorrect: z.boolean() }).strict()).max(50).default([]),
  assessmentPassingScore: z.number().int().min(0).max(100).default(70),
  assessmentMaxAttempts: z.number().int().min(1).max(100).nullable().default(null),
}).strict();
export type WriteLongreadQuestion = z.infer<typeof writeLongreadQuestionSchema>;

export const publicExerciseQuestionSchema = z.object({
  id: z.string().uuid(), type: questionTypeSchema, title: z.string(), text: z.string().nullable(), imageUrl: z.string().nullable(),
  points: z.number().int().min(1), scoringMode: scoringModeSchema,
  definition: publicQuestionDefinitionSchema.optional(),
  options: z.array(z.object({ id: z.string().uuid(), text: z.string().nullable(), imageUrl: z.string().nullable() }).strict()),
  assessment: z.object({ id: z.string().uuid(), title: z.string(), passingScore: z.number().int(), maxAttempts: z.number().int().nullable() }).strict(),
}).strict();
export type PublicExerciseQuestion = z.infer<typeof publicExerciseQuestionSchema>;
export type ExerciseResult = { answer?: z.infer<typeof assessmentAnswerSchema>; attemptId?: string; attempt?: number; preview?: boolean; score: number; maxScore: number; percentage: number; passed: boolean; isCorrect: boolean;
  correctDefinition?: z.infer<typeof questionDefinitionSchema> | null; correctOptionIds?: string[] };
export type ExerciseStates = { version: number; exercises: { blockId: string; attemptsUsed: number; nextAttempt: number; remaining: number; testExhausted: boolean; lastResult: ExerciseResult | null }[];
  tests: { id: string; title: string; passingScore: number; maxAttempts: number | null; attemptsUsed: number; remaining: number | null; requiredRemaining: number;
    latest: { attemptId: string; score: number; maxScore: number; percentage: number; passed: boolean } | null }[] };
