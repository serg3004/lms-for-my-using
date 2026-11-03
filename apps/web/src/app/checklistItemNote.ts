import type { ChecklistItemSummary } from '../shared/api/types.js';

/**
 * PR 415: the explanation rule of a criterion, the same rule the API applies (apps/api .../checklist-item-note.ts).
 * The explanation is the result's `comment`; the rule says when the field is offered and whether it must be filled.
 */
export type NoteItem = Pick<ChecklistItemSummary, 'noteRule' | 'noteAnswers' | 'noteRequired'>;
export type NoteAnswer = { checked?: boolean; scaleLevel?: number | null; answerState?: string } | null | undefined;

export const NOTE_ANSWER_UNCHECKED = 'unchecked';

/** `hasScale`: the criterion is answered with level buttons (its own scale or the sheet's), not a tick box. */
export function isNoteOffered(item: NoteItem, answer: NoteAnswer, hasScale: boolean): boolean {
  if (item.noteRule === 'always') return true;
  if (item.noteRule !== 'on_answers') return false;
  if (!answer || answer.answerState === 'skipped' || answer.answerState === 'unanswered') return false;
  const answers = item.noteAnswers ?? [];
  if (answer.scaleLevel !== null && answer.scaleLevel !== undefined) return answers.includes(String(answer.scaleLevel));
  if (hasScale) return false;
  return answer.checked === false && answers.includes(NOTE_ANSWER_UNCHECKED);
}

export function isNoteRequired(item: NoteItem, answer: NoteAnswer, hasScale: boolean): boolean {
  return item.noteRequired === true && isNoteOffered(item, answer, hasScale);
}

/** The answer a click is about to save, as the rule sees it (before the server has it). */
export function pendingAnswer(next: { checked?: boolean; scaleLevel?: number }): NoteAnswer {
  return { checked: next.checked ?? false, scaleLevel: next.scaleLevel ?? null, answerState: 'answered' };
}
