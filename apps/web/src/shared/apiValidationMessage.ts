import i18n from 'i18next';

import { ApiClientError } from './apiClient.js';
import type { ApiErrorDetail } from './api/types.js';

/**
 * PR 454: a rejected form no longer shows the bare "Validation failed". The API sends `details` (a path of the field and
 * the reason); this turns them into "Field «Dangers»: choose an answer set". `label` resolves a path to the name the author
 * sees (for example the title of a feedback field); without it the last part of the path is named when it is a known one.
 */
export type DetailLabel = (path: string[]) => string | null;

const MAX_SHOWN = 3;

function tr(key: string, fallback: string, values: Record<string, unknown> = {}): string {
  return String(i18n.t(key, { defaultValue: fallback, ...values }));
}

const PART_LABELS: Record<string, [string, string]> = {
  title: ['validation.field.title', 'Title'],
  description: ['validation.field.description', 'Description'],
  passThreshold: ['validation.field.passThreshold', 'Pass threshold'],
  scaleLevels: ['validation.field.scaleLevels', 'Scale levels'],
  feedbackLayout: ['validation.field.feedbackLayout', 'Feedback'],
  appearance: ['validation.field.appearance', 'Appearance'],
  answerSetId: ['validation.field.answerSetId', 'Answer set'],
  accessMode: ['validation.field.accessMode', 'Access'],
  preSessionVisibility: ['validation.field.preSessionVisibility', 'What the employee sees before the session'],
  name: ['validation.field.name', 'Name'],
  label: ['validation.field.label', 'Name'],
  points: ['validation.field.points', 'Points'],
  weight: ['validation.field.weight', 'Weight'],
  text: ['validation.field.text', 'Text'],
};

/** The reason in the user's language: the known server texts first, then the kind of the rule that failed. */
export function problemText(detail: ApiErrorDetail): string {
  const message = detail.message ?? '';
  if (message === 'A choice field needs an answer set') return tr('validation.problem.answerSetRequired', 'choose an answer set');
  if (message === 'Field title is required') return tr('validation.problem.titleRequired', 'enter a name');
  if (message === 'The feedback section needs at least one field') return tr('validation.problem.feedbackNeedsField', 'add at least one field');
  if (/^Duplicate id/.test(message)) return tr('validation.problem.duplicate', 'a repeated identifier');
  switch (detail.code) {
    case 'too_small': return /at least 1 character|Too small: expected string to have >=1/i.test(message) || /^String must contain at least 1/.test(message)
      ? tr('validation.problem.required', 'fill in the field') : tr('validation.problem.tooSmall', 'the value is too small or too short');
    case 'too_big': return tr('validation.problem.tooBig', 'the value is too large or too long');
    case 'invalid_type': return /undefined|required/i.test(message) ? tr('validation.problem.required', 'fill in the field') : tr('validation.problem.invalid', 'the value is not allowed');
    case 'invalid_format':
    case 'invalid_string':
    case 'invalid_value':
    case 'invalid_enum_value':
    case 'invalid_union': return tr('validation.problem.invalid', 'the value is not allowed');
    default: return message || tr('validation.problem.invalid', 'the value is not allowed');
  }
}

function pathOf(detail: ApiErrorDetail): string[] {
  return detail.field ? detail.field.split('.').filter(Boolean) : [];
}

function fieldName(path: string[], label?: DetailLabel): string | null {
  const resolved = label?.(path);
  if (resolved) return resolved;
  const known = [...path].reverse().find((part) => PART_LABELS[part]);
  return known ? tr(PART_LABELS[known]![0], PART_LABELS[known]![1]) : null;
}

/** "Field «Dangers»: choose an answer set" for every detail (three at most, then "and N more"). */
export function describeDetails(details: ApiErrorDetail[], label?: DetailLabel): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const detail of details) {
    const problem = problemText(detail);
    const name = fieldName(pathOf(detail), label);
    const line = name ? tr('validation.line', 'Field “{{field}}”: {{problem}}', { field: name, problem }) : problem.charAt(0).toUpperCase() + problem.slice(1);
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
  }
  const shown = lines.slice(0, MAX_SHOWN).join('; ');
  return lines.length > MAX_SHOWN ? `${shown}; ${tr('validation.more', 'and {{count}} more', { count: lines.length - MAX_SHOWN })}` : shown;
}

/** The text for a failed request: the reason of a rejected form, otherwise the message of the API, otherwise `fallback`. */
export function apiErrorText(error: unknown, fallback: string, label?: DetailLabel): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.code === 'VALIDATION_ERROR' || (error.status === 400 && error.details.length > 0)) {
    if (error.details.length > 0) return describeDetails(error.details, label);
    return tr('validation.generic', 'Check the filled fields and try again.');
  }
  return error.message || fallback;
}
