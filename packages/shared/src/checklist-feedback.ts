export const FEEDBACK_MAX_DEPTH = 3;
export const FEEDBACK_MAX_SECTIONS = 30;
export const FEEDBACK_MAX_FIELDS = 30;
export const FEEDBACK_TEXT_MAX_LENGTH = 4000;
export const FEEDBACK_BUILTIN_IDS = ['strengths', 'developmentAreas', 'nextSteps'] as const;
export type FeedbackBuiltinId = (typeof FEEDBACK_BUILTIN_IDS)[number];

export type FeedbackFieldDef = {
  id: string;
  kind: 'text' | 'choice';
  /** Empty only for built-in fields: the client shows the localized default title. */
  title: string;
  required: boolean;
  builtin?: FeedbackBuiltinId;
  answerSetId?: string;
  multiple?: boolean;
};
export type FeedbackSectionDef = {
  id: string;
  title: string;
  fields: FeedbackFieldDef[];
  sections: FeedbackSectionDef[];
};
export type FeedbackLayout = { title?: string; fields: FeedbackFieldDef[]; sections: FeedbackSectionDef[] };
export type FeedbackAnswerOption = { id: string; name: string; description: string | null };
export type FeedbackAnswerSetSnapshot = { id: string; name: string; options: FeedbackAnswerOption[] };
export type FeedbackAnswerValue = string | string[];
export type FeedbackAnswers = Record<string, FeedbackAnswerValue>;
/** Input patch: `null` clears an answer. */
export type FeedbackAnswersPatch = Record<string, FeedbackAnswerValue | null>;


export function defaultFeedbackLayout(feedbackRequired: boolean): FeedbackLayout {
  return {
    fields: [
      { id: 'strengths', kind: 'text', title: '', required: feedbackRequired, builtin: 'strengths' },
      { id: 'developmentAreas', kind: 'text', title: '', required: feedbackRequired, builtin: 'developmentAreas' },
      { id: 'nextSteps', kind: 'text', title: '', required: false, builtin: 'nextSteps' },
    ],
    sections: [],
  };
}

export function collectFeedbackFields(layout: FeedbackLayout): FeedbackFieldDef[] {
  const result = [...layout.fields];
  const visit = (sections: FeedbackSectionDef[]) => {
    for (const section of sections) {
      result.push(...section.fields);
      visit(section.sections);
    }
  };
  visit(layout.sections);
  return result;
}


export function readFeedbackAnswers(session: {
  feedbackAnswers?: unknown;
  strengths?: string | null;
  developmentAreas?: string | null;
  nextSteps?: string | null;
}): FeedbackAnswers {
  const stored = session.feedbackAnswers;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const answers: FeedbackAnswers = {};
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof value === 'string') answers[key] = value;
      else if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) answers[key] = value as string[];
    }
    return answers;
  }
  const answers: FeedbackAnswers = {};
  if (session.strengths) answers.strengths = session.strengths;
  if (session.developmentAreas) answers.developmentAreas = session.developmentAreas;
  if (session.nextSteps) answers.nextSteps = session.nextSteps;
  return answers;
}


export function firstMissingRequiredFeedback(layout: FeedbackLayout | null, answers: FeedbackAnswers): FeedbackFieldDef | null {
  if (!layout) return null;
  for (const field of collectFeedbackFields(layout)) {
    if (!field.required) continue;
    const value = answers[field.id];
    const filled = typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) && value.length > 0;
    if (!filled) return field;
  }
  return null;
}


export type FeedbackConfig = { layout: FeedbackLayout; answerSets: Record<string, FeedbackAnswerSetSnapshot> };
export function isCustomFeedback(layout?: FeedbackLayout | null) {
  return !!layout && (!!layout.title || layout.sections.length > 0 || layout.fields.length !== 3 || layout.fields.some((field, index) => field.builtin !== FEEDBACK_BUILTIN_IDS[index] || !!field.title || field.kind !== 'text' || field.required));
}
export type FeedbackRow = { id: string; title: string; value: string; kind: 'section' | 'field'; depth: number; path: string[] };
/** Frozen labels/options only: shared by the browser, PDF and tabular exports. */
export function feedbackRows(config: FeedbackConfig, answers: FeedbackAnswers, labels: Record<FeedbackBuiltinId, string>): FeedbackRow[] {
  const rows: FeedbackRow[] = [];
  function fields(list: FeedbackFieldDef[], depth: number, path: string[]) {
    for (const field of list) {
      const answer = answers[field.id];
      const value = field.kind === 'text' ? typeof answer === 'string' ? answer : '' :
        (config.answerSets[field.answerSetId ?? '']?.options ?? []).filter((option) => Array.isArray(answer) && answer.includes(option.id)).map((option) => option.name + (option.description ? ` — ${option.description}` : '')).join('; ');
      rows.push({ id: field.id, title: field.title || (field.builtin ? labels[field.builtin] : ''), value, kind: 'field', depth, path });
    }
  }
  function sections(list: FeedbackSectionDef[], depth: number, path: string[]) { for (const section of list) { const next = [...path, section.title]; rows.push({ id: section.id, title: section.title, value: '', kind: 'section', depth, path }); fields(section.fields, depth, next); sections(section.sections, depth + 1, next); } }
  fields(config.layout.fields, 0, []); sections(config.layout.sections, 1, []); return rows;
}
