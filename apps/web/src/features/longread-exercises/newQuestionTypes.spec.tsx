import '../../i18n/index.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { PublicQuestionDefinition } from '@lms/shared/assessment-question-types';
import type { AttemptAnswerResult } from '../../shared/api/types.js';
import { correctAnswerText, ownAnswerText } from './answer-text.js';
import { emptyQuestionDefinition } from './question-author-model.js';
import { QuestionDefinitionFields } from './QuestionAuthorFields.js';
import { exerciseAnswerComplete, QuestionResponseFields } from './QuestionResponseFields.js';

const t = ((key: string, options?: { number?: number }) => options?.number ? `${key}:${options.number}` : key) as TFunction;
const drop: Extract<PublicQuestionDefinition, { type: 'image_drop' }> = { type: 'image_drop', background: '', objects: [{ id: 'o1', text: 'Valve' }, { id: 'o2', text: 'Gauge' }],
  zones: [{ id: 'z1', shape: 'rect', x: 5, y: 5, width: 20, height: 20 }, { id: 'z2', shape: 'ellipse', x: 50, y: 50, width: 20, height: 20 }] };
const sort: Extract<PublicQuestionDefinition, { type: 'card_sort' }> = { type: 'card_sort', categories: [{ id: 'k1', text: 'Safe' }, { id: 'k2', text: 'Unsafe' }], cards: [{ id: 'c1', text: 'Helmet' }, { id: 'c2', text: 'Cables' }] };
const question = (definition: PublicQuestionDefinition, type: 'image_drop' | 'card_sort') => ({ id: 'q', type, options: [], definition });

describe('PR 539 image drop and card sort', () => {
  it('counts an answer complete only when every zone / card is placed', () => {
    const dropQuestion = question(drop, 'image_drop'), sortQuestion = question(sort, 'card_sort');
    expect(exerciseAnswerComplete(dropQuestion, { questionId: 'q', response: { type: 'image_drop', placements: [{ zoneId: 'z1', objectId: 'o1' }] } })).toBe(false);
    expect(exerciseAnswerComplete(dropQuestion, { questionId: 'q', response: { type: 'image_drop', placements: [{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o1' }] } })).toBe(true);
    expect(exerciseAnswerComplete(sortQuestion, { questionId: 'q', response: { type: 'card_sort', placements: [{ cardId: 'c1', categoryId: 'k1' }] } })).toBe(false);
    expect(exerciseAnswerComplete(sortQuestion, { questionId: 'q', response: { type: 'card_sort', placements: [{ cardId: 'c1', categoryId: 'k1' }, { cardId: 'c2', categoryId: 'k2' }] } })).toBe(true);
  });

  it('matching with extra answers is complete when every left item has its own answer', () => {
    const matching: PublicQuestionDefinition = { type: 'matching', left: [{ id: 'l1', text: 'A' }, { id: 'l2', text: 'B' }], right: [{ id: 'r1', text: '1' }, { id: 'r2', text: '2' }, { id: 'r3', text: 'trap' }] };
    const base = { id: 'q', type: 'matching' as const, options: [], definition: matching };
    expect(exerciseAnswerComplete(base, { questionId: 'q', response: { type: 'matching', pairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r3' }] } })).toBe(true);
    expect(exerciseAnswerComplete(base, { questionId: 'q', response: { type: 'matching', pairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r1' }] } })).toBe(false);
  });

  it('renders a keyboard path for every zone and card: a labelled list per zone and a category list per card', () => {
    const html = renderToStaticMarkup(<QuestionResponseFields question={question(drop, 'image_drop')} answer={{ questionId: 'q', response: { type: 'image_drop', placements: [{ zoneId: 'z1', objectId: 'o2' }] } }} onChange={vi.fn()} />);
    expect(html.match(/<select/g)).toHaveLength(2);
    expect(html).toContain('Valve'); expect(html).toContain('aria-pressed="false"');
    const sorted = renderToStaticMarkup(<QuestionResponseFields question={question(sort, 'card_sort')} answer={null} onChange={vi.fn()} />);
    expect(sorted.match(/<select/g)).toHaveLength(2);
    expect(sorted).toContain('draggable="true"'); expect(sorted).toContain('Safe'); expect(sorted).toContain('Unsafe');
  });

  it('offers authors zone geometry, a correct object and extra matching answers', () => {
    const image = renderToStaticMarkup(<QuestionDefinitionFields definition={emptyQuestionDefinition('image_drop')!} onChange={vi.fn()} />);
    expect(image.match(/type="number"/g)).toHaveLength(4);
    const cards = renderToStaticMarkup(<QuestionDefinitionFields definition={emptyQuestionDefinition('card_sort')!} onChange={vi.fn()} />);
    expect(cards.match(/<fieldset/g)).toHaveLength(2);
    const matching = emptyQuestionDefinition('matching')!;
    if (matching.type !== 'matching') throw new Error('matching expected');
    const extras = renderToStaticMarkup(<QuestionDefinitionFields definition={{ ...matching, right: [...matching.right, { id: 'trap', text: 'Trap' }] }} onChange={vi.fn()} />);
    expect(extras).toContain('Trap');
  });

  it('renders a free-shape zone as a clipped, clickable area and a picture object with a readable name', () => {
    const shaped = { ...drop, objects: [{ id: 'o1', text: '', image: JSON.stringify({ kind: 'file', fileId: '11111111-1111-4111-8111-111111111111.png', caption: '', alt: '' }) }, drop.objects[1]!],
      zones: [{ id: 'z1', shape: 'polygon' as const, x: 5, y: 5, width: 30, height: 30, points: [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }, drop.zones[1]!] };
    const html = renderToStaticMarkup(<QuestionResponseFields question={question(shaped, 'image_drop')} answer={null} onChange={vi.fn()} />);
    expect(html).toContain('clip-path:polygon(50% 0%, 100% 100%, 0% 100%)');
    expect(html).toContain('aria-label="Объект 1"');
  });

  it('describes the correct and the own answer for review', () => {
    const full = { ...drop, correctPairs: [{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o2' }] };
    expect(correctAnswerText({ options: [] }, { correctDefinition: full, correctOptionIds: [] }, t)).toBe('longreadExercises.zone:1 → Valve\nlongreadExercises.zone:2 → Gauge');
    const sorted = { ...sort, correctPlacements: [{ cardId: 'c1', categoryId: 'k1' }, { cardId: 'c2', categoryId: 'k2' }] };
    expect(correctAnswerText({ options: [] }, { correctDefinition: sorted, correctOptionIds: [] }, t)).toBe('Safe: Helmet\nUnsafe: Cables');
    const base = { id: 'a', questionId: 'q', selectedOptionId: null, selectedOptionIds: null, isCorrect: false, score: 0, selectedOption: null,
      question: { id: 'q', title: 'Q', type: 'card_sort', points: 4, order: 0, definition: sort } } as unknown as AttemptAnswerResult;
    expect(ownAnswerText({ ...base, response: { type: 'card_sort', placements: [{ cardId: 'c1', categoryId: 'k2' }] } }, t)).toBe('Helmet → Unsafe');
  });
});
