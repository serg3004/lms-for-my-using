import '../i18n/index.js';
import { describe, expect, it } from 'vitest';
import type { FeedbackLayout } from '@lms/shared/checklist-feedback';

import { ApiClientError } from './apiClient.js';
import { apiErrorText, describeDetails } from './apiValidationMessage.js';
import { feedbackFieldAt, feedbackFieldLabel, feedbackFocusId, feedbackPrecheck } from '../features/admin-checklists/checklistErrorTargets.js';

const layout: FeedbackLayout = {
  fields: [{ id: 'a', title: 'Сильные стороны', required: false, kind: 'text' }],
  sections: [{ id: 's', title: 'Раздел', fields: [{ id: 'h', title: 'Опасности', required: false, kind: 'choice' }], sections: [{ id: 'n', title: 'Вложенный', fields: [{ id: 'x', title: 'Вложенное поле', required: false, kind: 'choice', answerSetId: 'set' }], sections: [] }] }],
} as FeedbackLayout;

function validation(details: { field: string; message: string; code: string }[]) {
  return new ApiClientError('Validation failed', 400, { statusCode: 400, path: '/x', timestamp: 't', error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } } as never);
}

describe('apiErrorText', () => {
  it('names the feedback field and the reason instead of "Validation failed"', () => {
    const error = validation([{ field: 'feedbackLayout.sections.0.fields.0.answerSetId', message: 'A choice field needs an answer set', code: 'custom' }]);
    const text = apiErrorText(error, 'fallback', feedbackFieldLabel(layout));
    expect(text).toContain('Опасности');
    expect(text).not.toContain('Validation failed');
  });

  it('names a known setting when the path has no field title', () => {
    const text = describeDetails([{ field: 'passThreshold', message: 'Too big', code: 'too_big' }]);
    expect(text).toMatch(/Pass threshold|Порог/);
  });

  it('lists three problems and counts the rest, without repeats', () => {
    const details = ['title', 'description', 'passThreshold', 'appearance', 'appearance'].map((field) => ({ field, message: 'Invalid', code: 'invalid_value' }));
    expect(describeDetails(details).split('; ')).toHaveLength(4);
  });

  it('keeps the message of a non-validation API error and the fallback for other errors', () => {
    expect(apiErrorText(new ApiClientError('Forbidden', 403), 'fallback')).toBe('Forbidden');
    expect(apiErrorText(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('does not show the bare text when the server sends no details', () => {
    const error = new ApiClientError('Validation failed', 400, { statusCode: 400, path: '/x', timestamp: 't', error: { code: 'VALIDATION_ERROR', message: 'Validation failed' } } as never);
    expect(apiErrorText(error, 'fallback')).not.toBe('Validation failed');
  });
});

describe('feedback error targets', () => {
  it('finds a field in a section and in a nested section', () => {
    expect(feedbackFieldAt(layout, 'feedbackLayout.fields.0.title'.split('.'))?.id).toBe('a');
    expect(feedbackFieldAt(layout, 'feedbackLayout.sections.0.fields.0.answerSetId'.split('.'))?.id).toBe('h');
    expect(feedbackFieldAt(layout, 'feedbackLayout.sections.0.sections.0.fields.0.answerSetId'.split('.'))?.id).toBe('x');
    expect(feedbackFieldAt(layout, ['title'])).toBeNull();
  });

  it('focuses the answer set select for answerSetId and the name input otherwise', () => {
    expect(feedbackFocusId(layout, 'feedbackLayout.sections.0.fields.0.answerSetId'.split('.'))).toBe('feedback-set-h');
    expect(feedbackFocusId(layout, 'feedbackLayout.fields.0.title'.split('.'))).toBe('feedback-field-a');
  });

  it('finds a choice field without an answer set before the request is sent', () => {
    const found = feedbackPrecheck(layout);
    expect(found.map((detail) => detail.field)).toEqual(['feedbackLayout.sections.0.fields.0.answerSetId']);
    expect(feedbackPrecheck(null)).toEqual([]);
  });
});
