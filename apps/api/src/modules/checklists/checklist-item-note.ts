/**
 * PR 415: the per-criterion "explanation" rule. The explanation is the result's existing `comment`; the rule only says
 * when the field is offered and whether it must be filled. Everything here is pure so the API, the tests and (through
 * a copy of the same rule in the web client) the screens agree.
 */
export const NOTE_RULES = ['off', 'always', 'on_answers'] as const;
export type NoteRule = (typeof NOTE_RULES)[number];
export const NOTE_ANSWER_UNCHECKED = 'unchecked';
export const MAX_DESCRIPTION_LENGTH = 2000;

export type NoteConfig = { noteRule?: string | null; noteAnswers?: unknown; noteRequired?: boolean | null };
export type NoteAnswer = { checked?: boolean; scaleLevel?: number | null; answerState?: string };

/** The stored list as clean strings: level values ("2") and "unchecked". Anything else is dropped. */
export function parseNoteAnswers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && (entry === NOTE_ANSWER_UNCHECKED || /^\d{1,4}$/.test(entry))) seen.add(entry);
  }
  return [...seen];
}

/** True when the explanation field is on offer for this criterion given the answer so far (`answer` undefined = not answered yet). */
export function isNoteOffered(item: NoteConfig, answer: NoteAnswer | undefined, hasScale: boolean): boolean {
  if (item.noteRule === 'always') return true;
  if (item.noteRule !== 'on_answers') return false;
  if (!answer || answer.answerState === 'skipped' || answer.answerState === 'unanswered') return false;
  const answers = parseNoteAnswers(item.noteAnswers);
  if (answer.scaleLevel !== null && answer.scaleLevel !== undefined) return answers.includes(String(answer.scaleLevel));
  if (hasScale) return false;
  return answer.checked === false && answers.includes(NOTE_ANSWER_UNCHECKED);
}

/** True when the offered explanation must be filled before the answer counts. */
export function isNoteRequired(item: NoteConfig, answer: NoteAnswer | undefined, hasScale: boolean): boolean {
  return item.noteRequired === true && isNoteOffered(item, answer, hasScale);
}
