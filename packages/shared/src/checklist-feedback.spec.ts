import { describe, expect, it } from 'vitest';
import { defaultFeedbackLayout, firstMissingRequiredFeedback, feedbackRows, isCustomFeedback, readFeedbackAnswers, type FeedbackConfig } from './checklist-feedback.js';
const config: FeedbackConfig = { layout: { title: 'Coach notes', fields: [], sections: [{ id: 'group', title: 'Practice', fields: [{ id: 'verdict', title: 'Readiness', kind: 'choice', required: true, answerSetId: 'set', multiple: true }, { id: 'comment', title: 'Advice', kind: 'text', required: false }], sections: [] }] }, answerSets: { set: { id: 'set', name: 'Readiness', options: [{ id: 'a', name: 'Ready', description: 'Works independently' }, { id: 'b', name: 'Needs help', description: null }] } } };
describe('configurable feedback projection', () => {
  it('keeps the three localized-default identities and lossless legacy text', () => {
    expect(defaultFeedbackLayout(false).fields.map(({ id }) => id)).toEqual(['strengths', 'developmentAreas', 'nextSteps']);
    expect(readFeedbackAnswers({ strengths: 'legacy\ntext', developmentAreas: null })).toEqual({ strengths: 'legacy\ntext' });
    expect(isCustomFeedback(defaultFeedbackLayout(false))).toBe(false);
  });
  it('requires a selected choice and respects field-level requiredness without a global flag', () => {
    expect(firstMissingRequiredFeedback(config.layout, {})?.id).toBe('verdict');
    expect(firstMissingRequiredFeedback(config.layout, { verdict: ['a'] })).toBeNull();
    const layout = defaultFeedbackLayout(false); layout.fields[2]!.required = true;
    expect(isCustomFeedback(layout)).toBe(true); expect(firstMissingRequiredFeedback(layout, {})?.id).toBe('nextSteps');
  });
  it('uses frozen section names, option names and descriptions, ignoring unknown option ids', () => {
    const rows = feedbackRows(config, { verdict: ['a', 'foreign'], comment: 'Keep practicing' }, { strengths: 'S', developmentAreas: 'D', nextSteps: 'C' });
    expect(rows.map(({ title }) => title)).toEqual(['Practice', 'Readiness', 'Advice']);
    expect(rows[1]).toMatchObject({ value: 'Ready — Works independently', path: ['Practice'] });
    expect(rows[2]!.value).toBe('Keep practicing');
    expect(config.answerSets.set!.options[0]!.name).toBe('Ready');
  });
});
