import type { QuestionDefinition, QuestionScoringMode, QuestionType } from '@lms/shared/assessment-question-types';
import type { AssessmentSummary } from '../../shared/api/types.js';
import type { ValidAssessmentForm } from './model.js';

export type EditorOption = {
  id: string;
  text: string | null;
  imageUrl: string | null;
  isCorrect: boolean;
};

export type EditorQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  text: string | null;
  imageUrl: string | null;
  points: number;
  definition: QuestionDefinition | null;
  scoringMode: QuestionScoringMode;
  options: EditorOption[];
};

export type EditorSettings = Omit<ValidAssessmentForm, 'slug' | 'status' | 'timeLimitMinutes'> & {
  timeLimitMinutes: number | null;
};

export type EditorContent = { settings: EditorSettings; questions: EditorQuestion[] };
export type EditorDocument = {
  assessment: AssessmentSummary & { randomizeOrder: boolean };
  questions: EditorQuestion[];
  draft: EditorContent | null;
  placements: { id: string; longreadBlockId: string | null; course: { title: string } | null; lesson: { title: string } | null }[];
  assignments: { userId: string; dueAt: string; user: { firstName: string; lastName: string } }[];
};

export function moveEditorItem<T extends { id: string }>(items: T[], id: string, to: number): T[] {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0 || to < 0 || to >= items.length || from === to) return items;
  const updated = [...items];
  const [item] = updated.splice(from, 1);
  updated.splice(to, 0, item);
  return updated;
}

export function newEditorQuestion(): EditorQuestion {
  return {
    id: crypto.randomUUID(), type: 'single_choice', title: '', text: null, imageUrl: null,
    points: 1, definition: null, scoringMode: 'all_or_nothing', options: [],
  };
}

export function copyEditorQuestion(question: EditorQuestion): EditorQuestion {
  return {
    ...question, id: crypto.randomUUID(),
    options: question.options.map((option) => ({ ...option, id: crypto.randomUUID() })),
  };
}
