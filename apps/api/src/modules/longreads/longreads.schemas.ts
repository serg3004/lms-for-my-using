import { z } from 'zod';

import { blockTypeSchema, LONGREAD_SCHEMA_VERSION } from './longread-blocks.js';

export const MAX_CHAPTERS = 200;
export const MAX_BLOCKS_PER_CHAPTER = 1000;
export const MAX_BLOCKS_PER_DOCUMENT = 5000;

const uuid = z.string().uuid();

/** Reader settings; the reader itself arrives in PR 385, the values are stored and validated from the start. */
export const longreadSettingsSchema = z.object({
  readingOrder: z.enum(['free', 'sequential']).default('free'),
  requiredChapters: z.number().int().min(0).max(MAX_CHAPTERS).default(0),
  tableOfContents: z.enum(['expanded', 'collapsed', 'off']).default('expanded'),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
  allowCopy: z.boolean().default(true),
}).strict();
export type LongreadSettings = z.infer<typeof longreadSettingsSchema>;

export const saveBlockSchema = z.object({
  id: uuid.optional(),
  type: blockTypeSchema,
  title: z.string().trim().max(200).nullable().optional(),
  hidden: z.boolean().optional(),
  schemaVersion: z.number().int().min(1).max(1000).default(LONGREAD_SCHEMA_VERSION),
  content: z.unknown(),
}).strict();

export const saveChapterSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(200),
  hidden: z.boolean().default(false),
  blocks: z.array(saveBlockSchema).max(MAX_BLOCKS_PER_CHAPTER),
}).strict();

/** The whole draft in one atomic save (autosave): `revision` is the revision the client edited. */
export const saveLongreadSchema = z.object({
  revision: z.number().int().min(1),
  settings: longreadSettingsSchema.optional(),
  chapters: z.array(saveChapterSchema).min(1).max(MAX_CHAPTERS),
}).strict();
export type SaveLongreadInput = z.infer<typeof saveLongreadSchema>;
