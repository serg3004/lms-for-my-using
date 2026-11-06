import { BadRequestException } from '@nestjs/common';

import {
  applyFeedbackPatch,
  defaultFeedbackLayout,
  dropMissingAnswerSets,
  effectiveFeedbackLayout,
  feedbackLayoutSchema,
  firstMissingRequiredFeedback,
  legacyFeedbackColumns,
  normalizeFeedbackPatch,
  readFeedbackAnswers,
  type FeedbackAnswerSetSnapshot,
  type FeedbackLayout,
} from './checklist-feedback-layout.js';

const setId = '11111111-1111-4111-8111-111111111111';
const sets: Record<string, FeedbackAnswerSetSnapshot> = {
  [setId]: { id: setId, name: 'Verdict', options: [{ id: 'a', name: 'Yes', description: null }, { id: 'b', name: 'No', description: 'Explain' }] },
};
const layout: FeedbackLayout = {
  fields: [{ id: 'note', kind: 'text', title: 'Note', required: true }],
  sections: [
    {
      id: 's1', title: 'Level 1', fields: [{ id: 'verdict', kind: 'choice', title: 'Verdict', required: false, answerSetId: setId, multiple: false }],
      sections: [{ id: 's2', title: 'Level 2', fields: [{ id: 'tags', kind: 'choice', title: 'Tags', required: true, answerSetId: setId, multiple: true }], sections: [] }],
    },
  ],
};

describe('feedback layout (PR 405)', () => {
  describe('schema', () => {
    it('accepts a nested layout and fills defaults', () => {
      expect(feedbackLayoutSchema.parse({ fields: [{ id: 'x', kind: 'text', title: 'X' }] })).toEqual({
        fields: [{ id: 'x', kind: 'text', title: 'X', required: false }],
        sections: [],
      });
      expect(feedbackLayoutSchema.safeParse(layout).success).toBe(true);
    });

    it('rejects a fourth nesting level, duplicate ids, empty layouts and malformed fields', () => {
      const deep = { fields: [], sections: [{ id: 'a', title: 'A', fields: [], sections: [{ id: 'b', title: 'B', fields: [], sections: [{ id: 'c', title: 'C', fields: [], sections: [{ id: 'd', title: 'D', fields: [{ id: 'f', kind: 'text', title: 'F' }], sections: [] }] }] }] }] };
      expect(feedbackLayoutSchema.safeParse(deep).success).toBe(false);
      expect(feedbackLayoutSchema.safeParse({ fields: [{ id: 'x', kind: 'text', title: 'X' }, { id: 'x', kind: 'text', title: 'Y' }] }).success).toBe(false);
      expect(feedbackLayoutSchema.safeParse({ fields: [], sections: [] }).success).toBe(false);
      expect(feedbackLayoutSchema.safeParse({ fields: [{ id: 'x', kind: 'choice', title: 'X' }] }).success).toBe(false);
      expect(feedbackLayoutSchema.safeParse({ fields: [{ id: 'x', kind: 'text', title: '' }] }).success).toBe(false);
      expect(feedbackLayoutSchema.safeParse({ fields: [{ id: 'bad id', kind: 'text', title: 'X' }] }).success).toBe(false);
    });

    it('allows an untitled field only for a built-in field with its own id', () => {
      expect(feedbackLayoutSchema.safeParse(defaultFeedbackLayout(false)).success).toBe(true);
      expect(feedbackLayoutSchema.safeParse({ fields: [{ id: 'other', kind: 'text', title: '', builtin: 'strengths' }] }).success).toBe(false);
    });
  });

  describe('effective layout', () => {
    it('falls back to the classic fields; required only when the sheet says so', () => {
      expect(effectiveFeedbackLayout({ feedbackRequired: false })?.fields.map((field) => [field.id, field.required])).toEqual([['strengths', false], ['developmentAreas', false], ['nextSteps', false]]);
      expect(effectiveFeedbackLayout({ feedbackRequired: true })?.fields.map((field) => field.required)).toEqual([true, true, false]);
    });
    it('is off when feedback is disabled and uses a configured layout otherwise', () => {
      expect(effectiveFeedbackLayout({ feedbackEnabled: false, feedbackLayout: layout })).toBeNull();
      expect(effectiveFeedbackLayout({ feedbackLayout: layout })).toEqual(layout);
      expect(effectiveFeedbackLayout({ feedbackLayout: { broken: true } })?.fields).toHaveLength(3);
    });
  });

  describe('answers', () => {
    it('validates text, single and multiple choice answers', () => {
      expect(normalizeFeedbackPatch(layout, sets, { note: '  hi  ', verdict: ['a'], tags: ['a', 'b', 'a'] })).toEqual({ note: 'hi', verdict: ['a'], tags: ['a', 'b'] });
      expect(normalizeFeedbackPatch(layout, sets, { note: '   ', verdict: [], tags: null })).toEqual({ note: null, verdict: null, tags: null });
      // PR 428: formatting survives, foreign markup does not, an empty paragraph counts as no answer.
      const rich = normalizeFeedbackPatch(layout, sets, { note: '<p><em>Важно</em><script>bad()</script></p>' });
      expect(rich['note']).toContain('<em>Важно</em>');
      expect(String(rich['note'])).not.toContain('script');
      expect(normalizeFeedbackPatch(layout, sets, { note: '<p> </p>' })).toEqual({ note: null });
      expect(() => normalizeFeedbackPatch(layout, sets, { note: `<strong>${'x'.repeat(4001)}</strong>` })).toThrow(BadRequestException);
    });
    it.each([
      [{ nope: 'x' }],
      [{ note: ['a'] }],
      [{ verdict: 'a' }],
      [{ verdict: ['a', 'b'] }],
      [{ verdict: ['zzz'] }],
      [{ note: 'x'.repeat(4001) }],
    ])('rejects %j', (patch) => {
      expect(() => normalizeFeedbackPatch(layout, sets, patch as never)).toThrow(BadRequestException);
    });
    it('rejects answers when the section is off, accepts an empty patch', () => {
      expect(() => normalizeFeedbackPatch(null, {}, { note: 'x' })).toThrow(BadRequestException);
      expect(normalizeFeedbackPatch(null, {}, {})).toEqual({});
    });
    it('merges patches and mirrors built-in fields into legacy columns', () => {
      const next = applyFeedbackPatch({ strengths: 'old', verdict: ['a'] }, { strengths: null, nextSteps: 'go', verdict: ['b'] });
      expect(next).toEqual({ nextSteps: 'go', verdict: ['b'] });
      expect(legacyFeedbackColumns(next)).toEqual({ strengths: null, developmentAreas: null, nextSteps: 'go' });
    });
    it('reads the JSON column, or the legacy columns of an older row', () => {
      expect(readFeedbackAnswers({ feedbackAnswers: { a: 'x', b: ['1'], c: 5 } })).toEqual({ a: 'x', b: ['1'] });
      expect(readFeedbackAnswers({ feedbackAnswers: null, strengths: 's', developmentAreas: null, nextSteps: 'n' })).toEqual({ strengths: 's', nextSteps: 'n' });
    });
  });

  describe('required fields', () => {
    it('returns the first unanswered required field in document order', () => {
      expect(firstMissingRequiredFeedback(layout, {})?.id).toBe('note');
      expect(firstMissingRequiredFeedback(layout, { note: 'x' })?.id).toBe('tags');
      expect(firstMissingRequiredFeedback(layout, { note: 'x', tags: ['a'] })).toBeNull();
      expect(firstMissingRequiredFeedback(layout, { note: '  ', tags: ['a'] })?.id).toBe('note');
      expect(firstMissingRequiredFeedback(null, {})).toBeNull();
    });
  });

  describe('templates', () => {
    it('drops choice fields whose answer set is gone, and the whole layout when nothing is left', () => {
      const kept = dropMissingAnswerSets(layout, new Set());
      expect(kept?.fields).toHaveLength(1);
      expect(kept?.sections[0]?.fields).toEqual([]);
      expect(kept?.sections[0]?.sections[0]?.fields).toEqual([]);
      expect(dropMissingAnswerSets(layout, new Set([setId]))).toEqual(layout);
      expect(dropMissingAnswerSets({ fields: [], sections: [{ id: 's', title: 'S', fields: [layout.sections[0]!.fields[0]!], sections: [] }] }, new Set())).toBeNull();
    });
  });
});
