import { z } from 'zod';

import { FIELD_LANGUAGES } from './user-field-values.js';

/** PR 499: input of the definition routes and of the value maps. */
const labelText = z.string().trim().min(1).max(80);
export const fieldLabelsSchema = z.object(Object.fromEntries(FIELD_LANGUAGES.map((language) => [language, labelText])) as Record<(typeof FIELD_LANGUAGES)[number], typeof labelText>).strict();

export const fieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'The key is lower-case letters, digits and underscores, starting with a letter (2-40 characters)');
export const fieldTypeSchema = z.enum(['text', 'number', 'date', 'list', 'phone', 'boolean']);
const viewerSchema = z.enum(['manager', 'self']);

export const fieldOptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'The option key is lower-case letters, digits, hyphens and underscores'),
  labels: fieldLabelsSchema,
  archived: z.boolean().optional(),
}).strict();

const rightsFields = {
  visibleTo: z.array(viewerSchema).max(2).transform((items) => [...new Set(items)]),
  editableBy: z.array(viewerSchema).max(2).transform((items) => [...new Set(items)]),
};

/** What does not depend on the stored definition: a list has options and only a list has them; unique and searchable fit text, number, phone. */
function checkShape(input: { type?: string | undefined; unique?: boolean | undefined; searchable?: boolean | undefined; options?: Array<{ key: string }> | undefined; visibleTo?: string[] | undefined; editableBy?: string[] | undefined }, context: z.RefinementCtx, typeKnown: boolean) {
  const issue = (message: string, path: string) => context.addIssue({ code: 'custom', message, path: [path] });
  if (typeKnown) {
    if ((input.type === 'list') !== (input.options !== undefined)) issue('Options are required for a list field and allowed only there', 'options');
    if ((input.unique || input.searchable) && !['text', 'number', 'phone'].includes(input.type ?? '')) issue('Unique and searchable fit text, number and phone fields only', input.unique ? 'unique' : 'searchable');
  }
  if (input.options && new Set(input.options.map((option) => option.key)).size !== input.options.length) issue('Option keys must be different', 'options');
  const visible = new Set(input.visibleTo ?? []);
  if ((input.editableBy ?? []).some((viewer) => !visible.has(viewer))) issue('Who may change the field must also be allowed to see it', 'editableBy');
}

export const createUserFieldSchema = z.object({
  key: fieldKeySchema,
  labels: fieldLabelsSchema,
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  searchable: z.boolean().default(false),
  options: z.array(fieldOptionSchema).min(1).max(100).optional(),
  visibleTo: rightsFields.visibleTo.default([]),
  editableBy: rightsFields.editableBy.default([]),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict().superRefine((input, context) => checkShape(input, context, true));

/** `key` and `type` never change; everything else may. Consistency with the stored type is checked by the service. */
export const updateUserFieldSchema = z.object({
  labels: fieldLabelsSchema.optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  searchable: z.boolean().optional(),
  options: z.array(fieldOptionSchema).min(1).max(100).optional(),
  visibleTo: rightsFields.visibleTo.optional(),
  editableBy: rightsFields.editableBy.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, { message: 'Nothing to change' }).superRefine((input, context) => checkShape(input, context, false));

export const reorderUserFieldsSchema = z.object({ keys: z.array(fieldKeySchema).min(1).max(100) }).strict().refine((input) => new Set(input.keys).size === input.keys.length, { message: 'Keys must be different', path: ['keys'] });

export const listUserFieldsQuerySchema = z.object({ includeArchived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true') });

/** Values of custom fields as sent by a client: `{ key: value | null }`; null or an empty text clears the value. */
export const customFieldValuesSchema = z.record(fieldKeySchema, z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).refine((values) => Object.keys(values).length <= 100, { message: 'Too many fields' });
export type CustomFieldValues = z.infer<typeof customFieldValuesSchema>;
export type CreateUserFieldInput = z.infer<typeof createUserFieldSchema>;
export type UpdateUserFieldInput = z.infer<typeof updateUserFieldSchema>;

// Compact JSON tuples allow several independent filters without ambiguous delimiters.
export const analyticsFieldFiltersSchema = z.string().max(4096).optional().transform((value, ctx) => {
  if (value === undefined) return undefined;
  try {
    return z.array(z.tuple([fieldKeySchema, z.string().trim().min(1).max(500)])).min(1).max(10).parse(JSON.parse(value));
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid user field filters' });
    return z.NEVER;
  }
});

export type AnalyticsFieldFilters = z.output<typeof analyticsFieldFiltersSchema>;
