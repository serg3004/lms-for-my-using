import { richTextSchema, plainText } from '@lms/shared/rich-text';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * PR 405: configurable "Feedback" section of an observation sheet.
 *
 * A layout is a tree: fields directly under the root plus sections (up to three levels deep), each
 * holding fields and sub-sections. A field is free text or a choice from a reusable answer set.
 * A sheet without a layout (`feedbackLayout = null`) behaves as before PR 405: the three built-in
 * text fields (strengths, development areas, next steps). Sessions read the layout and the resolved
 * answer sets from the instance snapshot only, so editing a sheet or an answer set later never
 * changes an assigned instance.
 */
import { FEEDBACK_MAX_DEPTH, FEEDBACK_MAX_SECTIONS, FEEDBACK_MAX_FIELDS, FEEDBACK_TEXT_MAX_LENGTH, FEEDBACK_BUILTIN_IDS, defaultFeedbackLayout, collectFeedbackFields, type FeedbackFieldDef, type FeedbackSectionDef, type FeedbackLayout, type FeedbackAnswers, type FeedbackAnswersPatch, type FeedbackAnswerSetSnapshot, type FeedbackBuiltinId, type FeedbackAnswerOption } from '@lms/shared/checklist-feedback';
export * from '@lms/shared/checklist-feedback';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

export const feedbackFieldSchema: z.ZodType<FeedbackFieldDef> = z
  .object({
    id: idSchema,
    kind: z.enum(['text', 'choice']),
    title: richTextSchema(255),
    required: z.boolean().default(false),
    builtin: z.enum(FEEDBACK_BUILTIN_IDS).optional(),
    answerSetId: z.string().uuid().optional(),
    multiple: z.boolean().optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.builtin) {
      if (field.kind !== 'text' || field.id !== field.builtin) {
        ctx.addIssue({ code: 'custom', message: 'A built-in field must be a text field with its own id' });
      }
    } else if (plainText(field.title).trim().length === 0) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Field title is required' });
    }
    if (field.kind === 'choice' && !field.answerSetId) {
      ctx.addIssue({ code: 'custom', path: ['answerSetId'], message: 'A choice field needs an answer set' });
    }
    if (field.kind === 'text' && (field.answerSetId || field.multiple !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'A text field has no answer set and no multiple flag' });
    }
  }) as z.ZodType<FeedbackFieldDef>;

const feedbackSectionSchema: z.ZodType<FeedbackSectionDef> = z.lazy(() =>
  z
    .object({
      id: idSchema,
      title: richTextSchema(255, 1),
      fields: z.array(feedbackFieldSchema).max(FEEDBACK_MAX_FIELDS).default([]),
      sections: z.array(feedbackSectionSchema).max(FEEDBACK_MAX_SECTIONS).default([]),
    })
    .strict(),
) as z.ZodType<FeedbackSectionDef>;

export const feedbackLayoutSchema: z.ZodType<FeedbackLayout> = z
  .object({
    title: richTextSchema(255).optional(),
    fields: z.array(feedbackFieldSchema).max(FEEDBACK_MAX_FIELDS).default([]),
    sections: z.array(feedbackSectionSchema).max(FEEDBACK_MAX_SECTIONS).default([]),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const ids = new Set<string>();
    let sections = 0;
    let fields = 0;
    const visitFields = (list: FeedbackFieldDef[]) => {
      for (const field of list) {
        fields += 1;
        if (ids.has(field.id)) ctx.addIssue({ code: 'custom', message: `Duplicate id: ${field.id}` });
        ids.add(field.id);
      }
    };
    const visit = (list: FeedbackSectionDef[], depth: number) => {
      for (const section of list) {
        sections += 1;
        if (depth > FEEDBACK_MAX_DEPTH) ctx.addIssue({ code: 'custom', message: `Sections can be nested at most ${FEEDBACK_MAX_DEPTH} levels deep` });
        if (ids.has(section.id)) ctx.addIssue({ code: 'custom', message: `Duplicate id: ${section.id}` });
        ids.add(section.id);
        visitFields(section.fields);
        visit(section.sections, depth + 1);
      }
    };
    visitFields(layout.fields);
    visit(layout.sections, 1);
    if (fields === 0) ctx.addIssue({ code: 'custom', message: 'The feedback section needs at least one field' });
    if (fields > FEEDBACK_MAX_FIELDS) ctx.addIssue({ code: 'custom', message: `At most ${FEEDBACK_MAX_FIELDS} fields are allowed` });
    if (sections > FEEDBACK_MAX_SECTIONS) ctx.addIssue({ code: 'custom', message: `At most ${FEEDBACK_MAX_SECTIONS} sections are allowed` });
  }) as z.ZodType<FeedbackLayout>;

/** The layout of a sheet that never configured one: the three classic text fields. */
export function parseFeedbackLayout(value: unknown): FeedbackLayout | null {
  if (value == null) return null;
  const parsed = feedbackLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The layout a session shows: `null` when the sheet's feedback section is switched off, the
 * configured layout when there is one, otherwise the classic three fields.
 */
export function effectiveFeedbackLayout(checklist: { feedbackEnabled?: boolean; feedbackRequired?: boolean; feedbackLayout?: unknown } | null | undefined): FeedbackLayout | null {
  if (!checklist || checklist.feedbackEnabled === false) return null;
  return parseFeedbackLayout(checklist.feedbackLayout) ?? defaultFeedbackLayout(checklist.feedbackRequired === true);
}

/** Depth-first, document order: root fields, then each section's fields and sub-sections. */
export function collectAnswerSetIds(layout: FeedbackLayout | null): string[] {
  if (!layout) return [];
  return [...new Set(collectFeedbackFields(layout).flatMap((field) => (field.answerSetId ? [field.answerSetId] : [])))];
}

/** Current answers of a session: the JSON column, or the legacy three columns for an old row. */
/**
 * Checks a patch against the layout and the answer sets frozen with the instance. Returns the
 * values to store (trimmed text; `null` = remove). Unknown fields, wrong value kinds and unknown or
 * several options for a single-choice field are rejected.
 */
export function normalizeFeedbackPatch(
  layout: FeedbackLayout | null,
  answerSets: Record<string, FeedbackAnswerSetSnapshot> | null | undefined,
  patch: FeedbackAnswersPatch,
): FeedbackAnswersPatch {
  const entries = Object.entries(patch);
  if (entries.length === 0) return {};
  if (!layout) throw new BadRequestException('The feedback section is switched off for this checklist');
  const fields = new Map(collectFeedbackFields(layout).map((field) => [field.id, field]));
  const normalized: FeedbackAnswersPatch = {};
  for (const [fieldId, value] of entries) {
    const field = fields.get(fieldId);
    if (!field) throw new BadRequestException(`Unknown feedback field: ${fieldId}`);
    if (value === null) {
      normalized[fieldId] = null;
    } else if (field.kind === 'text') {
      if (typeof value !== 'string') throw new BadRequestException(`Feedback field expects text: ${fieldId}`);
      const text = value.trim();
      if (text.length > FEEDBACK_TEXT_MAX_LENGTH) throw new BadRequestException(`Feedback text is too long: ${fieldId}`);
      normalized[fieldId] = text === '' ? null : text;
    } else {
      if (!Array.isArray(value)) throw new BadRequestException(`Feedback field expects a list of options: ${fieldId}`);
      const ids = [...new Set(value)];
      if (!field.multiple && ids.length > 1) throw new BadRequestException(`Feedback field accepts one option only: ${fieldId}`);
      const known = new Set((field.answerSetId ? answerSets?.[field.answerSetId]?.options : undefined)?.map((option) => option.id));
      if (ids.some((id) => !known.has(id))) throw new BadRequestException(`Unknown answer option for feedback field: ${fieldId}`);
      normalized[fieldId] = ids.length === 0 ? null : ids;
    }
  }
  return normalized;
}

export function applyFeedbackPatch(current: FeedbackAnswers, patch: FeedbackAnswersPatch): FeedbackAnswers {
  const next: FeedbackAnswers = { ...current };
  for (const [fieldId, value] of Object.entries(patch)) {
    if (value === null) delete next[fieldId];
    else next[fieldId] = value;
  }
  return next;
}

/** First required field (document order) that has no answer; `null` when the section is complete. */
/** Built-in fields stay mirrored into the legacy columns, which old readers (reports, exports) still use. */
export function legacyFeedbackColumns(answers: FeedbackAnswers) {
  const text = (id: FeedbackBuiltinId) => (typeof answers[id] === 'string' ? (answers[id] as string) : null);
  return { strengths: text('strengths'), developmentAreas: text('developmentAreas'), nextSteps: text('nextSteps') };
}

/** Answer sets referenced by a layout, reduced to what a session needs (the frozen copy). */
export function pickAnswerSets(
  layout: FeedbackLayout | null,
  sets: { id: string; name: string; options: unknown }[],
): Record<string, FeedbackAnswerSetSnapshot> {
  const wanted = new Set(collectAnswerSetIds(layout));
  const result: Record<string, FeedbackAnswerSetSnapshot> = {};
  for (const set of sets) {
    if (wanted.has(set.id)) result[set.id] = { id: set.id, name: set.name, options: parseAnswerOptions(set.options) };
  }
  return result;
}

export const answerOptionSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(255),
    description: richTextSchema(2000).nullable().optional(),
  })
  .strict();

export function parseAnswerOptions(value: unknown): FeedbackAnswerOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = answerOptionSchema.safeParse(entry);
    return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name, description: parsed.data.description ?? null }] : [];
  });
}

/**
 * A layout copied from a template whose answer sets were deleted since: choice fields that point
 * at a missing set drop out (like a deleted scale drops off a criterion); `null` if nothing is left.
 */
export function dropMissingAnswerSets(layout: FeedbackLayout, existingSetIds: ReadonlySet<string>): FeedbackLayout | null {
  const keepField = (field: FeedbackFieldDef) => field.kind === 'text' || (field.answerSetId !== undefined && existingSetIds.has(field.answerSetId));
  const clean = (sections: FeedbackSectionDef[]): FeedbackSectionDef[] =>
    sections.map((section) => ({ ...section, fields: section.fields.filter(keepField), sections: clean(section.sections) }));
  const result: FeedbackLayout = { ...layout, fields: layout.fields.filter(keepField), sections: clean(layout.sections) };
  return collectFeedbackFields(result).length === 0 ? null : result;
}
