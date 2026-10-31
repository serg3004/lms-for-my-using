import type { AttemptAnswerResult } from '../../shared/api/types.js';
import type { TFunction } from 'i18next';
import type { PublicExerciseQuestion, ExerciseResult } from '@lms/shared/longread-exercises';
export function correctAnswerText(question: Pick<PublicExerciseQuestion, 'options'>, result: Pick<ExerciseResult, 'correctDefinition' | 'correctOptionIds'>, t: TFunction): string {
  const d = result.correctDefinition;
  if (!d) return question.options.filter((o) => result.correctOptionIds?.includes(o.id)).map((o) => o.text ?? o.imageUrl ?? o.id).join(', ');
  if (d.type === 'true_false') return t(d.correctAnswer ? 'longreadExercises.true' : 'longreadExercises.false');
  if (d.type === 'matching') return d.correctPairs.map((p) => `${d.left.find((v) => v.id === p.leftId)?.text} → ${d.right.find((v) => v.id === p.rightId)?.text}`).join('\n');
  if (d.type === 'ordering') return d.correctOrder.map((id) => d.items.find((v) => v.id === id)?.text).join(' → ');
  if (d.type === 'fill_blank') return d.blanks.map((b) => `${b.id}: ${b.acceptedAnswers.join(' / ')}`).join('\n');
  return d.acceptedAnswers.join(' / ');
}

export function ownAnswerText(answer: AttemptAnswerResult, t: TFunction): string {
  const r = answer.response, d = answer.question.definition;
  if (!r) {
    if (answer.selectedOption) return answer.selectedOption.text ?? answer.selectedOption.imageUrl ?? answer.selectedOption.id;
    return Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds.map((id) => { const option = answer.question.options?.find((o) => o.id === id); return option?.text ?? option?.imageUrl ?? id; }).join(', ') : '—';
  }
  if (r.type === 'true_false') return t(r.value ? 'longreadExercises.true' : 'longreadExercises.false');
  if (r.type === 'short_answer') return r.text;
  if (r.type === 'fill_blank') return r.blanks.map((b) => `${b.blankId}: ${b.value}`).join('; ');
  if (r.type === 'ordering') return r.itemIds.map((id) => d?.type === 'ordering' ? d.items.find((v) => v.id === id)?.text ?? id : id).join(' → ');
  return r.pairs.map((p) => d?.type === 'matching' ? `${d.left.find((v) => v.id === p.leftId)?.text} → ${d.right.find((v) => v.id === p.rightId)?.text}` : `${p.leftId} → ${p.rightId}`).join('; ');
}
export function reviewedCorrectText(answer: AttemptAnswerResult, t: TFunction): string {
  return correctAnswerText({ options: answer.correctOptions ?? [] }, { correctDefinition: answer.correctDefinition, correctOptionIds: answer.correctOptions?.map((o) => o.id) }, t);
}
