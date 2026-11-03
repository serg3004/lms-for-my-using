import { describe, expect, it } from 'vitest';

import { isChecklistAnswerComplete, isChecklistNoteMissing, isChecklistRequirementSatisfied } from './checklistCompletion.js';
import { isNoteOffered, isNoteRequired, pendingAnswer } from './checklistItemNote.js';

// PR 415: the same rule the API applies (apps/api .../checklist-item-note.ts).
describe('criterion explanation rule (PR 415)', () => {
  const onNo = { noteRule: 'on_answers' as const, noteAnswers: ['unchecked'], noteRequired: true };
  const onLevel = { noteRule: 'on_answers' as const, noteAnswers: ['1'], noteRequired: true };

  it('offers the field by rule', () => {
    expect(isNoteOffered({ noteRule: 'off' }, pendingAnswer({ checked: false }), false)).toBe(false);
    expect(isNoteOffered({ noteRule: 'always' }, undefined, false)).toBe(true);
    expect(isNoteOffered(onNo, undefined, false)).toBe(false);
    expect(isNoteOffered(onNo, pendingAnswer({ checked: false }), false)).toBe(true);
    expect(isNoteOffered(onNo, pendingAnswer({ checked: true }), false)).toBe(false);
    expect(isNoteOffered(onLevel, pendingAnswer({ scaleLevel: 1 }), true)).toBe(true);
    expect(isNoteOffered(onLevel, pendingAnswer({ scaleLevel: 2 }), true)).toBe(false);
    expect(isNoteOffered(onLevel, { scaleLevel: 1, answerState: 'skipped' }, true)).toBe(false);
  });

  it('requires the explanation only when the criterion says so', () => {
    expect(isNoteRequired({ ...onLevel, noteRequired: false }, pendingAnswer({ scaleLevel: 1 }), true)).toBe(false);
    expect(isNoteRequired(onLevel, pendingAnswer({ scaleLevel: 1 }), true)).toBe(true);
  });

  it('an answer without its required explanation is not complete, and with it is', () => {
    const item = { ...onLevel, isRequired: true, photoRequired: false, scale: { id: 's', name: 'S', levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 10 }] } };
    expect(isChecklistNoteMissing(item, 'sum_points', { scaleLevel: 1 })).toBe(true);
    expect(isChecklistAnswerComplete(item, 'sum_points', { scaleLevel: 1 })).toBe(false);
    expect(isChecklistRequirementSatisfied(item, 'sum_points', { scaleLevel: 1, comment: '  ' })).toBe(false);
    expect(isChecklistAnswerComplete(item, 'sum_points', { scaleLevel: 1, comment: 'Нет ценников' })).toBe(true);
    expect(isChecklistAnswerComplete(item, 'sum_points', { scaleLevel: 2 })).toBe(true);
  });
});
