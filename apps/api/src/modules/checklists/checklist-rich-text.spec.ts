import { createChecklistSchema, createChecklistItemSchema, contextFieldSchema } from './checklists.schemas.js';
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
