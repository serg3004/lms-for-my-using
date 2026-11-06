import { submitChecklistItemResultSchema, submitChecklistSessionFeedbackSchema, submitChecklistSessionContextSchema, createChecklistSchema, createChecklistItemSchema, contextFieldSchema } from './checklists.schemas.js';
import { updateSheetPhotoSchema } from './checklist-sheet-photos.js';
import { feedbackFieldSchema, answerOptionSchema } from './checklist-feedback-layout.js';

describe('PR 427 author content', () => {
  it('applies the same cleaned visible-text limits to sheet, criterion, context and photo', () => {
    const text = '<strong>' + 'x'.repeat(200) + '</strong>';
    expect(createChecklistSchema.shape.title.parse(text)).toContain('<strong>');
    expect(updateSheetPhotoSchema.parse({ caption: text }).caption).toContain('<strong>');
    expect(createChecklistItemSchema.parse({ text: '<em>' + 'x'.repeat(500) + '</em>' }).text).toContain('<em>');
    expect(contextFieldSchema.shape.label.safeParse('<p> </p>').success).toBe(false);
  });
  it('sanitizes feedback labels and option descriptions', () => {
    expect(feedbackFieldSchema.parse({ id: 'one', kind: 'text', title: '<strong>Field</strong><script>bad()</script>' }).title).not.toContain('script');
    expect(answerOptionSchema.parse({ id: 'one', name: 'Option', description: '<em>Hint</em>' }).description).toContain('<em>');
  });
});

describe('PR 428 fill-in content', () => {
  it('cleans and bounds the criterion comment and the classic feedback fields', () => {
    expect(submitChecklistItemResultSchema.parse({ comment: '<strong>Ok</strong><script>bad()</script>' }).comment).toBe('<p><strong>Ok</strong></p>');
    expect(submitChecklistItemResultSchema.parse({ comment: 'plain\ntext' }).comment).toBe('plain\ntext');
    expect(submitChecklistItemResultSchema.safeParse({ comment: `<strong>${'x'.repeat(1001)}</strong>` }).success).toBe(false);
    const feedback = submitChecklistSessionFeedbackSchema.parse({ strengths: '<em>Сильно</em><iframe src="x"></iframe>', developmentAreas: null, version: 1 });
    expect(feedback.strengths).toBe('<p><em>Сильно</em></p>');
    expect(submitChecklistSessionFeedbackSchema.safeParse({ nextSteps: `<u>${'x'.repeat(4001)}</u>`, version: 1 }).success).toBe(false);
  });
  it('lets a multi-line context value carry markup beyond the visible limit but rejects absurd sizes', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(submitChecklistSessionContextSchema.safeParse({ values: { [id]: '<strong>x</strong>'.repeat(300) }, version: 1 }).success).toBe(true);
    expect(submitChecklistSessionContextSchema.safeParse({ values: { [id]: 'x'.repeat(24001) }, version: 1 }).success).toBe(false);
  });
});
