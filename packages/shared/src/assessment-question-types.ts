import { z } from 'zod';

export const questionTypeSchema = z.enum(['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer']);
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
const textPolicy = { caseSensitive: z.boolean(), whitespace: z.enum(['exact', 'trim', 'collapse']) };
const variants = z.array(text.refine((value) => value.length > 0, 'Answer variant cannot be empty')).min(1).max(50);
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
  z.object({ type: z.literal('short_answer'), acceptedAnswers: variants, ...textPolicy }).strict(),
]).superRefine((definition, ctx) => {
  const issue = () => ctx.addIssue({ code: 'custom', message: 'Definition requires unique ids, a complete bijection/permutation, and distinct nonempty normalized answer variants' });
  const sameSet = (actual: string[], expected: string[]) => actual.length === expected.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value));
  const unique = (items: { id: string }[]) => new Set(items.map((value) => value.id)).size === items.length;
  if (definition.type === 'matching' && (!unique(definition.left) || !unique(definition.right) || !sameSet(definition.correctPairs.map((value) => value.leftId), definition.left.map((value) => value.id)) || !sameSet(definition.correctPairs.map((value) => value.rightId), definition.right.map((value) => value.id)))) issue();
  if (definition.type === 'ordering' && (!unique(definition.items) || !sameSet(definition.correctOrder, definition.items.map((value) => value.id)))) issue();
  if (definition.type === 'fill_blank' && !unique(definition.blanks)) issue();
  if (definition.type === 'fill_blank' || definition.type === 'short_answer') {
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
]);
export type QuestionResponse = z.infer<typeof questionResponseSchema>;
export type PublicQuestionDefinition =
  | { type: 'true_false' }
  | { type: 'matching'; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { type: 'ordering'; items: { id: string; text: string }[] }
  | { type: 'fill_blank'; blanks: { id: string }[]; caseSensitive: boolean; whitespace: 'exact' | 'trim' | 'collapse' }
  | { type: 'short_answer'; caseSensitive: boolean; whitespace: 'exact' | 'trim' | 'collapse' };
