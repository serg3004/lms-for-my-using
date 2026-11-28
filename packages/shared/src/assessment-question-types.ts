import { z } from 'zod';
import { assessmentMaterialSchema, readAssessmentMaterial } from './longread-media.js';

export const questionTypeSchema = z.enum(['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer', 'image_drop', 'card_sort']);
export const scoringModeSchema = z.enum(['all_or_nothing', 'proportional', 'proportional_with_penalty', 'per_option']);
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionScoringMode = z.infer<typeof scoringModeSchema>;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
// PostgreSQL JSONB rejects NUL and unpaired UTF-16 surrogates; reject them before persistence.
function validUnicode(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code === 0 || code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}
const text = z.string().max(4000).refine(validUnicode, 'Use well-formed Unicode without NUL');
const item = z.object({ id, text: z.string().trim().min(1).max(2000).refine(validUnicode, 'Use well-formed Unicode without NUL') }).strict();
const pair = z.object({ leftId: id, rightId: id }).strict();
// PR 539: an image is an uploaded file (the same stored string as a question material), never an arbitrary link.
const imageMaterial = assessmentMaterialSchema.refine((value) => readAssessmentMaterial(value)?.kind === 'file', 'Use an uploaded image');
const percent = z.number().min(0).max(100);
const point = z.object({ x: percent, y: percent }).strict();
// A polygon keeps its points as percentages of its own box, so moving or resizing the box never changes the shape.
const zone = z.object({ id, shape: z.enum(['rect', 'ellipse', 'polygon']), x: percent, y: percent, width: percent.refine((value) => value >= 2, 'Zone is too small'), height: percent.refine((value) => value >= 2, 'Zone is too small'), points: z.array(point).min(3).max(12).optional() }).strict()
  .refine((value) => value.x + value.width <= 100.001 && value.y + value.height <= 100.001, 'Zone must stay inside the image')
  .refine((value) => (value.shape === 'polygon') === (value.points !== undefined), 'Only a polygon has points');
const card = z.object({ id, text: z.string().trim().max(2000).refine(validUnicode, 'Use well-formed Unicode without NUL'), image: imageMaterial.optional() }).strict()
  .refine((value) => value.text.length > 0 || value.image !== undefined, 'A card needs text or an image');
const dropObject = z.object({ id, text: z.string().trim().max(2000).refine(validUnicode, 'Use well-formed Unicode without NUL'), image: imageMaterial.optional() }).strict()
  .refine((value) => value.text.length > 0 || value.image !== undefined, 'An object needs text or an image');
const zonePair = z.object({ zoneId: id, objectId: id }).strict();
const cardPlacement = z.object({ cardId: id, categoryId: id }).strict();
const textPolicy = { caseSensitive: z.boolean(), whitespace: z.enum(['exact', 'trim', 'collapse']) };
const answerVariants = z.array(text.refine((value) => value.length > 0, 'Answer variant cannot be empty')).max(50);
const variants = answerVariants.min(1);
export function normalizeQuestionText(value: string, policy: { caseSensitive: boolean; whitespace: 'exact' | 'trim' | 'collapse' }): string {
  let normalized = value.normalize('NFC');
  if (policy.whitespace === 'trim') normalized = normalized.trim();
  if (policy.whitespace === 'collapse') normalized = normalized.trim().replace(/\s+/gu, ' ');
  return policy.caseSensitive ? normalized : normalized.toLowerCase();
}
export const questionDefinitionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('true_false'), correctAnswer: z.boolean() }).strict(),
  z.object({ type: z.literal('matching'), left: z.array(item).min(2).max(50), right: z.array(item).min(2).max(50), correctPairs: z.array(pair).min(2).max(50) }).strict(),
  z.object({ type: z.literal('ordering'), items: z.array(item).min(2).max(50), correctOrder: z.array(id).min(2).max(50) }).strict(),
  z.object({ type: z.literal('fill_blank'), blanks: z.array(z.object({ id, acceptedAnswers: variants }).strict()).min(1).max(50), ...textPolicy }).strict(),
  z.object({ type: z.literal('short_answer'), acceptedAnswers: answerVariants, manualReview: z.boolean().optional(), ...textPolicy }).strict(),
  z.object({ type: z.literal('image_drop'), background: imageMaterial, objects: z.array(dropObject).min(1).max(30), zones: z.array(zone).min(1).max(30), correctPairs: z.array(zonePair).min(1).max(30) }).strict(),
  z.object({ type: z.literal('card_sort'), categories: z.array(item).min(2).max(4), cards: z.array(card).min(2).max(50), correctPlacements: z.array(cardPlacement).min(2).max(50) }).strict(),
]).superRefine((definition, ctx) => {
  const issue = () => ctx.addIssue({ code: 'custom', message: 'Definition requires unique ids, a complete bijection/permutation, and distinct nonempty normalized answer variants' });
  const sameSet = (actual: string[], expected: string[]) => actual.length === expected.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value));
  const unique = (items: { id: string }[]) => new Set(items.map((value) => value.id)).size === items.length;
  // PR 539: `right` may hold extra answers that match nothing (distractors); every left item still has exactly one answer.
  if (definition.type === 'matching' && (!unique(definition.left) || !unique(definition.right) || !sameSet(definition.correctPairs.map((value) => value.leftId), definition.left.map((value) => value.id))
    || new Set(definition.correctPairs.map((value) => value.rightId)).size !== definition.correctPairs.length || definition.correctPairs.some((value) => !definition.right.some((item) => item.id === value.rightId)))) issue();
  if (definition.type === 'image_drop') {
    const zoneIds = definition.zones.map((value) => value.id);
    if (!unique(definition.zones) || !unique(definition.objects) || !sameSet(definition.correctPairs.map((value) => value.zoneId), zoneIds)
      || definition.correctPairs.some((value) => !definition.objects.some((object) => object.id === value.objectId))) issue();
  }
  if (definition.type === 'card_sort' && (!unique(definition.categories) || !unique(definition.cards) || !sameSet(definition.correctPlacements.map((value) => value.cardId), definition.cards.map((value) => value.id))
    || definition.correctPlacements.some((value) => !definition.categories.some((category) => category.id === value.categoryId)))) issue();
  if (definition.type === 'ordering' && (!unique(definition.items) || !sameSet(definition.correctOrder, definition.items.map((value) => value.id)))) issue();
  if (definition.type === 'fill_blank' && !unique(definition.blanks)) issue();
  if (definition.type === 'fill_blank' || definition.type === 'short_answer') {
    if (definition.type === 'short_answer' && !definition.manualReview && !definition.acceptedAnswers.length) issue();
    const groups = definition.type === 'fill_blank' ? definition.blanks.map((blank) => blank.acceptedAnswers) : [definition.acceptedAnswers];
    for (const group of groups) {
      const normalized = group.map((value) => normalizeQuestionText(value, definition));
      if (normalized.some((value) => !value.length) || new Set(normalized).size !== normalized.length) issue();
    }
  }
});
export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;
export const questionResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('true_false'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('matching'), pairs: z.array(pair).min(2).max(50) }).strict(),
  z.object({ type: z.literal('ordering'), itemIds: z.array(id).min(2).max(50) }).strict(),
  z.object({ type: z.literal('fill_blank'), blanks: z.array(z.object({ blankId: id, value: text }).strict()).min(1).max(50) }).strict(),
  z.object({ type: z.literal('short_answer'), text }).strict(),
  z.object({ type: z.literal('image_drop'), placements: z.array(zonePair).min(1).max(30) }).strict(),
  z.object({ type: z.literal('card_sort'), placements: z.array(cardPlacement).min(2).max(50) }).strict(),
]);
export type QuestionResponse = z.infer<typeof questionResponseSchema>;
export type PublicQuestionDefinition =
  | { type: 'true_false' }
  | { type: 'matching'; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { type: 'ordering'; items: { id: string; text: string }[] }
  | { type: 'fill_blank'; blanks: { id: string }[]; caseSensitive: boolean; whitespace: 'exact' | 'trim' | 'collapse' }
  | { type: 'short_answer'; manualReview?: boolean; caseSensitive: boolean; whitespace: 'exact' | 'trim' | 'collapse' }
  | { type: 'image_drop'; background: string; objects: { id: string; text: string; image?: string }[]; zones: { id: string; shape: 'rect' | 'ellipse' | 'polygon'; x: number; y: number; width: number; height: number; points?: { x: number; y: number }[] }[] }
  | { type: 'card_sort'; categories: { id: string; text: string }[]; cards: { id: string; text: string; image?: string }[] };

export const assessmentAnswerSchema = z.object({
  questionId: z.guid(),
  selectedOptionId: z.guid().optional(),
  selectedOptionIds: z.array(z.guid()).min(1).optional(),
  response: questionResponseSchema.optional(),
}).strict().refine((value) => [value.selectedOptionId, value.selectedOptionIds, value.response].filter((field) => field !== undefined).length === 1, { message: 'Answer requires exactly one format' });
export type AssessmentAnswer = z.infer<typeof assessmentAnswerSchema>;

export const draftAssessmentAnswerSchema = z.union([
  assessmentAnswerSchema,
  z.object({
    questionId: z.guid(),
    response: z.discriminatedUnion('type', [
      z.object({ type: z.literal('matching'), pairs: z.array(pair).max(50) }).strict(),
      z.object({ type: z.literal('ordering'), itemIds: z.array(z.union([id, z.literal('')])).max(50) }).strict(),
      z.object({ type: z.literal('image_drop'), placements: z.array(zonePair).max(30) }).strict(),
      z.object({ type: z.literal('card_sort'), placements: z.array(cardPlacement).max(50) }).strict(),
    ]),
  }).strict(),
]);

export const publicQuestionDefinitionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('true_false') }).strict(),
  z.object({ type: z.literal('matching'), left: z.array(item), right: z.array(item) }).strict(),
  z.object({ type: z.literal('ordering'), items: z.array(item) }).strict(),
  z.object({ type: z.literal('fill_blank'), blanks: z.array(z.object({ id }).strict()), ...textPolicy }).strict(),
  z.object({ type: z.literal('short_answer'), manualReview: z.boolean().optional(), ...textPolicy }).strict(),
  z.object({ type: z.literal('image_drop'), background: imageMaterial, objects: z.array(dropObject), zones: z.array(zone) }).strict(),
  z.object({ type: z.literal('card_sort'), categories: z.array(item), cards: z.array(card) }).strict(),
]);

/** Explicit allowlist: no answer key can enter the learner's quiz projection. */
export function projectQuestionDefinition(
  definition: QuestionDefinition,
  arrange: <T>(items: T[], group: 'left' | 'right' | 'items' | 'objects' | 'cards') => T[] = (items) => items,
): PublicQuestionDefinition {
  switch (definition.type) {
    case 'true_false': return { type: definition.type };
    case 'matching': return { type: definition.type, left: arrange(definition.left, 'left'), right: arrange(definition.right, 'right') };
    case 'ordering': return { type: definition.type, items: arrange(definition.items, 'items') };
    case 'fill_blank': return { type: definition.type, blanks: definition.blanks.map(({ id }) => ({ id })), caseSensitive: definition.caseSensitive, whitespace: definition.whitespace };
    case 'short_answer': return { type: definition.type, ...(definition.manualReview ? { manualReview: true } : {}), caseSensitive: definition.caseSensitive, whitespace: definition.whitespace };
    case 'image_drop': return { type: definition.type, background: definition.background, objects: arrange(definition.objects, 'objects'), zones: definition.zones };
    case 'card_sort': return { type: definition.type, categories: definition.categories, cards: arrange(definition.cards, 'cards') };
  }
}
