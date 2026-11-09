import { plainText } from '@lms/shared/rich-text';
import type { FeedbackFieldDef, FeedbackLayout } from '@lms/shared/checklist-feedback';

import type { ApiErrorDetail } from '../../shared/api/types.js';

/**
 * PR 454: maps the path of a rejected value (`feedbackLayout.sections.0.fields.1.answerSetId`) to the feedback field the
 * author sees, so the message can name it and the editor can focus it.
 */
export function feedbackFieldAt(layout: FeedbackLayout | null, path: string[]): FeedbackFieldDef | null {
  if (!layout || path[0] !== 'feedbackLayout') return null;
  let node: { fields: FeedbackFieldDef[]; sections: FeedbackLayout['sections'] } = layout;
  for (let i = 1; i < path.length - 1; i += 2) {
    const index = Number(path[i + 1]);
    if (!Number.isInteger(index)) return null;
    if (path[i] === 'sections') { const next = node.sections[index]; if (!next) return null; node = next; } else if (path[i] === 'fields') return node.fields[index] ?? null;
    else return null;
  }
  return null;
}

export function feedbackFieldLabel(layout: FeedbackLayout | null) {
  return (path: string[]): string | null => {
    const title = feedbackFieldAt(layout, path)?.title;
    return title ? plainText(title) || null : null;
  };
}

/** The id of the control to focus for a rejected path, or undefined when the path is not a known control. */
export function feedbackFocusId(layout: FeedbackLayout | null, path: string[]): string | undefined {
  const field = feedbackFieldAt(layout, path);
  if (!field) return undefined;
  return path[path.length - 1] === 'answerSetId' ? `feedback-set-${field.id}` : `feedback-field-${field.id}`;
}

/** A choice field without an answer set is refused by the server; found here first so the request is not sent. */
export function feedbackPrecheck(layout: FeedbackLayout | null): ApiErrorDetail[] {
  if (!layout) return [];
  const details: ApiErrorDetail[] = [];
  const visit = (node: { fields: FeedbackFieldDef[]; sections: FeedbackLayout['sections'] }, base: string[]) => {
    node.fields.forEach((field, index) => {
      if (field.kind === 'choice' && !field.answerSetId) details.push({ field: [...base, 'fields', String(index), 'answerSetId'].join('.'), message: 'A choice field needs an answer set', code: 'custom' });
    });
    node.sections.forEach((section, index) => visit(section, [...base, 'sections', String(index)]));
  };
  visit(layout, ['feedbackLayout']);
  return details;
}
