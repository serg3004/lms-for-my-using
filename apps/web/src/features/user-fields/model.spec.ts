import { describe, expect, it } from 'vitest';

import type { UserFieldView } from '../../shared/api/userFields.js';
import { customFieldsPayload, displayValue, headerNames, importCellValue, missingRequired, pickableOptions, toFormValues } from './model.js';
import { editorFrom, emptyEditor, fillLabels, suggestKey, toInput, validateEditor } from './editorModel.js';

const labels = (ru: string, en = ru) => ({ ru, en, kk: ru, zh: ru });
const field = (key: string, type: UserFieldView['type'], extra: Partial<UserFieldView> = {}): UserFieldView => ({ key, labels: labels(key), type, required: false, unique: false, searchable: false, options: null, sortOrder: 1, ...extra });
const schedule = field('work_schedule', 'list', { options: [{ key: '5-2', labels: labels('5/2') }, { key: 'old', labels: labels('Старый'), archived: true }] });

describe('custom field values in forms (PR 500)', () => {
  it('sends only what changed, an emptied value as null, a yes/no as a boolean', () => {
    const fields = [field('employee_number', 'text'), field('union', 'boolean'), field('note', 'text')];
    const original = toFormValues({ employee_number: 'A-1', union: true });
    expect(customFieldsPayload(fields, { employee_number: 'A-1', union: 'true', note: '' }, original)).toBeUndefined();
    expect(customFieldsPayload(fields, { employee_number: 'A-2', union: 'false', note: 'x' }, original)).toEqual({ employee_number: 'A-2', union: false, note: 'x' });
    expect(customFieldsPayload(fields, { employee_number: '', union: 'true' }, original)).toEqual({ employee_number: null });
  });

  it('on creation sends only the filled fields and never a field the caller may not edit', () => {
    const fields = [field('a1', 'text'), field('hire_date', 'date', { editable: false }), field('b2', 'text')];
    expect(customFieldsPayload(fields, { a1: ' x ', hire_date: '2026-01-01', b2: '' })).toEqual({ a1: 'x' });
    expect(customFieldsPayload(fields, {})).toBeUndefined();
  });

  it('names the required fields left empty, ignoring read-only ones', () => {
    const fields = [field('a1', 'text', { required: true, labels: labels('Табельный номер') }), field('b2', 'text', { required: true, editable: false }), field('c3', 'text')];
    expect(missingRequired(fields, { a1: ' ' }, 'ru')).toEqual(['Табельный номер']);
    expect(missingRequired(fields, { a1: 'x' }, 'ru')).toEqual([]);
  });

  it('shows list titles and yes/no words, and offers an archived option only to the person who holds it', () => {
    expect(displayValue(schedule, '5-2', 'ru', 'Да', 'Нет')).toBe('5/2');
    expect(displayValue(field('union', 'boolean'), true, 'ru', 'Да', 'Нет')).toBe('Да');
    expect(displayValue(field('note', 'text'), undefined, 'ru', 'Да', 'Нет')).toBe('');
    expect(pickableOptions(schedule, '').map((option) => option.key)).toEqual(['5-2']);
    expect(pickableOptions(schedule, 'old').map((option) => option.key)).toEqual(['5-2', 'old']);
  });
});

describe('custom field cells of an import file (PR 500)', () => {
  it('matches a list value by title in any language, and reads yes/no and day.month.year', () => {
    expect(importCellValue(schedule, '5/2')).toBe('5-2');
    expect(importCellValue(schedule, '5-2')).toBe('5-2');
    expect(importCellValue(schedule, 'unknown')).toBe('unknown');
    expect(importCellValue(field('union', 'boolean'), 'Да')).toBe('true');
    expect(importCellValue(field('union', 'boolean'), 'нет')).toBe('false');
    expect(importCellValue(field('hire', 'date'), '1.2.2026')).toBe('2026-02-01');
    expect(importCellValue(field('hire', 'date'), '2026-02-01')).toBe('2026-02-01');
  });

  it('recognizes a column by key and by title in every language', () => {
    expect(headerNames({ key: 'work_schedule', labels: { ru: 'График работы', en: 'Work schedule', kk: 'Жұмыс кестесі', zh: '工作时间表' } })).toEqual(['work_schedule', 'график работы', 'work schedule', 'жұмыс кестесі', '工作时间表']);
  });
});

describe('field editor (PR 500)', () => {
  it('suggests Latin keys, transliterating Russian and avoiding taken ones', () => {
    expect(suggestKey('Табельный номер')).toBe('tabelnyy_nomer');
    expect(suggestKey('Employee number')).toBe('employee_number');
    expect(suggestKey('2024 plan')).toBe('f_2024_plan');
    expect(suggestKey('Employee number', new Set(['employee_number']))).toBe('employee_number_2');
    expect(suggestKey('5/2 график', new Set(), 'option')).toBe('5-2-grafik');
  });

  it('fills empty languages from the first title and validates the key, titles and list values', () => {
    expect(fillLabels({ ru: '', en: 'Phone', kk: '', zh: '' })).toEqual({ ru: 'Phone', en: 'Phone', kk: 'Phone', zh: 'Phone' });
    const state = emptyEditor();
    expect(validateEditor(state)).toEqual({ key: 'key', labels: 'labels' });
    expect(validateEditor({ ...state, key: 'badge', labels: labels('Бейдж') })).toEqual({});
    const list = { ...state, key: 'size', type: 'list' as const, labels: labels('Размер') };
    expect(validateEditor(list).options).toBe('optionsEmpty');
    expect(validateEditor({ ...list, options: [{ key: 's', labels: labels('S'), archived: false, saved: false }, { key: 's', labels: labels('S'), archived: false, saved: false }] }).options).toBe('optionsDuplicate');
    expect(validateEditor({ ...list, options: [{ key: 's', labels: labels(''), archived: false, saved: false }] }).options).toBe('optionsInvalid');
  });

  it('turns the editor into the API input: edit rights need visibility, flags fit the type', () => {
    const state = { ...emptyEditor(), key: 'badge', labels: labels('Бейдж'), unique: true, searchable: true, visible: { manager: true, self: false }, editable: { manager: true, self: true } };
    expect(toInput(state)).toMatchObject({ key: 'badge', type: 'text', unique: true, searchable: true, visibleTo: ['manager'], editableBy: ['manager'] });
    expect(toInput({ ...state, type: 'date' })).toMatchObject({ unique: false, searchable: false });
    const list = toInput({ ...state, type: 'list', options: [{ key: 'a', labels: labels('A'), archived: true, saved: true }] });
    expect(list.options).toEqual([{ key: 'a', labels: labels('A'), archived: true }]);
  });

  it('loads a stored definition into the editor with its rights', () => {
    const editor = editorFrom({ id: '1', key: 'telegram', labels: labels('Telegram'), type: 'phone', required: false, unique: false, searchable: false, options: null, visibleTo: ['manager', 'self'], editableBy: ['self'], sortOrder: 3, archived: false });
    expect(editor).toMatchObject({ mode: 'edit', visible: { manager: true, self: true }, editable: { manager: false, self: true } });
  });
});
