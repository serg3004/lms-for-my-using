import { createChecklistItemSchema, updateChecklistItemSchema } from './checklists.schemas.js';
import { isNoteOffered, isNoteRequired, parseNoteAnswers } from './checklist-item-note.js';

describe('checklist item explanation rule (PR 415)', () => {
  it('parses only level values and "unchecked"', () => {
    expect(parseNoteAnswers(['1', 'unchecked', '1', 'x', 5, '12345'])).toEqual(['1', 'unchecked']);
    expect(parseNoteAnswers(null)).toEqual([]);
  });

  it('offers the field by rule: off never, always every time, on_answers only on the listed answer', () => {
    expect(isNoteOffered({ noteRule: 'off' }, { scaleLevel: 1, answerState: 'answered' }, true)).toBe(false);
    expect(isNoteOffered({ noteRule: 'always' }, undefined, false)).toBe(true);
    const onLevel = { noteRule: 'on_answers', noteAnswers: ['1'] };
    expect(isNoteOffered(onLevel, undefined, true)).toBe(false);
    expect(isNoteOffered(onLevel, { scaleLevel: 1, answerState: 'answered' }, true)).toBe(true);
    expect(isNoteOffered(onLevel, { scaleLevel: 2, answerState: 'answered' }, true)).toBe(false);
    expect(isNoteOffered(onLevel, { scaleLevel: 1, answerState: 'skipped' }, true)).toBe(false);
    const onTick = { noteRule: 'on_answers', noteAnswers: ['unchecked'] };
    expect(isNoteOffered(onTick, { checked: false, answerState: 'answered' }, false)).toBe(true);
    expect(isNoteOffered(onTick, { checked: true, answerState: 'answered' }, false)).toBe(false);
  });

  it('requires the explanation only when the criterion says so', () => {
    expect(isNoteRequired({ noteRule: 'always', noteRequired: false }, { checked: true }, false)).toBe(false);
    expect(isNoteRequired({ noteRule: 'always', noteRequired: true }, { checked: true }, false)).toBe(true);
  });

  it('validates the new item fields', () => {
    expect(createChecklistItemSchema.safeParse({ text: 'a' }).data).toMatchObject({ descriptionEnabled: false, noteRule: 'off', noteRequired: false });
    expect(updateChecklistItemSchema.safeParse({ noteRule: 'sometimes' }).success).toBe(false);
    expect(updateChecklistItemSchema.safeParse({ noteAnswers: ['2', 'unchecked'], description: 'x'.repeat(2001) }).success).toBe(false);
    expect(updateChecklistItemSchema.safeParse({ noteAnswers: ['2', 'unchecked'], description: 'Проверить ценники' }).success).toBe(true);
  });
});
