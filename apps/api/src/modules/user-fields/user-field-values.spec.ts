import { canEditField, canSeeField, fieldAuditMetadata, normalizeFieldValue, normalizePhone, presentFieldValue, searchTerms } from './user-field-values.js';
import type { FieldDefinition } from './user-field-values.js';
import { createUserFieldSchema, customFieldValuesSchema, fieldKeySchema, reorderUserFieldsSchema, updateUserFieldSchema } from './user-fields.schemas.js';
import { validateFieldValues } from './user-fields.service.js';

const labels = { ru: 'Поле', en: 'Field', kk: 'Өріс', zh: '字段' };
let counter = 0;
function definition(overrides: Partial<FieldDefinition> & Pick<FieldDefinition, 'key' | 'type'>): FieldDefinition {
  counter += 1;
  return { id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`, labels, required: false, isUnique: false, searchable: false, options: null, visibleTo: ['manager', 'self'], editableBy: ['manager', 'self'], sortOrder: counter, archivedAt: null, ...overrides };
}

describe('custom user field values (PR 499)', () => {
  it('validates every type on the server', () => {
    const text = definition({ key: 'note', type: 'text' });
    expect(normalizeFieldValue(text, '  Привет ')).toEqual({ ok: true, value: 'Привет', normalized: 'привет' });
    expect(normalizeFieldValue(text, 'x'.repeat(501))).toEqual({ ok: false, code: 'tooLong' });
    expect(normalizeFieldValue(text, 5)).toEqual({ ok: false, code: 'invalid' });

    const number = definition({ key: 'grade', type: 'number' });
    expect(normalizeFieldValue(number, '007.50')).toEqual({ ok: true, value: '7.5', normalized: '7.5' });
    expect(normalizeFieldValue(number, 12)).toMatchObject({ ok: true, value: '12' });
    expect(normalizeFieldValue(number, 'abc')).toMatchObject({ ok: false });
    expect(normalizeFieldValue(number, '1e30')).toMatchObject({ ok: false });

    const date = definition({ key: 'hire', type: 'date' });
    expect(normalizeFieldValue(date, '2026-02-28')).toMatchObject({ ok: true });
    expect(normalizeFieldValue(date, '2026-02-30')).toMatchObject({ ok: false });
    expect(normalizeFieldValue(date, '28.02.2026')).toMatchObject({ ok: false });

    const phone = definition({ key: 'wa', type: 'phone' });
    expect(normalizeFieldValue(phone, '+7 (701) 123-45-67')).toMatchObject({ ok: true, normalized: normalizePhone('+77011234567') });
    expect(normalizeFieldValue(phone, 'call me')).toMatchObject({ ok: false });

    const flag = definition({ key: 'union', type: 'boolean' });
    expect(normalizeFieldValue(flag, true)).toMatchObject({ ok: true, value: 'true' });
    expect(normalizeFieldValue(flag, 'False')).toMatchObject({ ok: true, value: 'false' });
    expect(normalizeFieldValue(flag, 'yes')).toMatchObject({ ok: false });
    expect(presentFieldValue('boolean', 'true')).toBe(true);
    expect(presentFieldValue('number', '7.5')).toBe(7.5);

    const list = definition({ key: 'size', type: 'list', options: [{ key: 's', labels }, { key: 'm', labels, archived: true }] });
    expect(normalizeFieldValue(list, 's')).toMatchObject({ ok: true });
    expect(normalizeFieldValue(list, 'xl')).toEqual({ ok: false, code: 'option' });
    expect(normalizeFieldValue(list, 'm')).toEqual({ ok: false, code: 'option' });
    expect(normalizeFieldValue(list, 'm', 'm')).toMatchObject({ ok: true });
  });

  it('treats a field the viewer cannot see as unknown and one they cannot edit as forbidden', () => {
    const hidden = definition({ key: 'salary_grade', type: 'text', visibleTo: [], editableBy: [] });
    const readOnly = definition({ key: 'hire', type: 'date', editableBy: [] });
    const open = definition({ key: 'note', type: 'text', editableBy: ['self'] });
    const all = [hidden, readOnly, open];

    expect(validateFieldValues(all, 'manager', { salary_grade: 'x' }, { mode: 'update' }).problems).toEqual([{ key: 'salary_grade', status: 400, message: 'Unknown field "salary_grade"' }]);
    expect(validateFieldValues(all, 'manager', { hire: '2026-01-01' }, { mode: 'update' }).problems).toMatchObject([{ key: 'hire', status: 403 }]);
    expect(validateFieldValues(all, 'self', { note: 'ok' }, { mode: 'update' })).toMatchObject({ problems: [], writes: [{ value: 'ok' }] });
    // The administrator sees and edits everything.
    expect(validateFieldValues(all, 'admin', { salary_grade: 'x', hire: '2026-01-01' }, { mode: 'update' }).problems).toEqual([]);
    expect(canSeeField(hidden, 'manager')).toBe(false);
    expect(canEditField(readOnly, 'self')).toBe(false);
  });

  it('requires required fields on creation and refuses to clear them', () => {
    const required = definition({ key: 'employee_number', type: 'text', required: true, isUnique: true });
    expect(validateFieldValues([required], 'admin', {}, { mode: 'create' }).problems).toMatchObject([{ key: 'employee_number', status: 400 }]);
    expect(validateFieldValues([required], 'admin', { employee_number: null }, { mode: 'update' }).problems).toMatchObject([{ status: 400 }]);
    expect(validateFieldValues([required], 'admin', { employee_number: ' A-1 ' }, { mode: 'create' }).writes).toMatchObject([{ value: 'A-1', normalized: 'a-1' }]);
    const optional = definition({ key: 'note', type: 'text' });
    expect(validateFieldValues([optional], 'admin', { note: '' }, { mode: 'update' }).writes).toEqual([{ definition: optional, clear: true }]);
  });

  it('ignores archived fields and builds search terms', () => {
    const archived = definition({ key: 'old', type: 'text', archivedAt: new Date() });
    expect(validateFieldValues([archived], 'admin', { old: 'x' }, { mode: 'update' }).problems).toHaveLength(1);
    expect(searchTerms('  АБ-12 ')).toEqual(['аб-12']);
    expect(searchTerms('+7 701 123')).toContain(normalizePhone('+7 701 123'));
    expect(searchTerms('   ')).toEqual([]);
  });

  it('keeps old and new values in the audit only for unique fields', () => {
    expect(fieldAuditMetadata([])).toEqual({});
    expect(fieldAuditMetadata([{ key: 'note', from: 'a', to: 'b', unique: false }])).toEqual({ customFields: ['note'] });
    expect(fieldAuditMetadata([{ key: 'note', from: 'a', to: 'b', unique: false }, { key: 'employee_number', from: '1', to: '2', unique: true }]))
      .toEqual({ customFields: ['note', 'employee_number'], customFieldChanges: [{ key: 'employee_number', from: '1', to: '2' }] });
  });
});

describe('custom user field schemas (PR 499)', () => {
  const base = { key: 'employee_number', type: 'text', labels };

  it('needs labels in every language and a clean key', () => {
    expect(createUserFieldSchema.safeParse(base).success).toBe(true);
    expect(createUserFieldSchema.safeParse({ ...base, labels: { ru: 'a', en: 'b' } }).success).toBe(false);
    expect(fieldKeySchema.safeParse('Employee Number').success).toBe(false);
    expect(fieldKeySchema.safeParse('x').success).toBe(false);
  });

  it('accepts options for lists only and keeps key and type immutable', () => {
    expect(createUserFieldSchema.safeParse({ ...base, type: 'list' }).success).toBe(false);
    expect(createUserFieldSchema.safeParse({ ...base, type: 'list', options: [{ key: 'a', labels }] }).success).toBe(true);
    expect(createUserFieldSchema.safeParse({ ...base, options: [{ key: 'a', labels }] }).success).toBe(false);
    expect(updateUserFieldSchema.safeParse({ key: 'other' }).success).toBe(false);
    expect(updateUserFieldSchema.safeParse({ type: 'number' }).success).toBe(false);
    expect(reorderUserFieldsSchema.safeParse({ keys: ['ab', 'ab'] }).success).toBe(false);
  });

  it('takes strings, numbers, booleans and null as values', () => {
    expect(customFieldValuesSchema.safeParse({ a1: 'x', b2: 1, c3: true, d4: null }).success).toBe(true);
    expect(customFieldValuesSchema.safeParse({ a1: { nested: 1 } }).success).toBe(false);
    expect(customFieldValuesSchema.safeParse({ 'Bad Key': 'x' }).success).toBe(false);
  });
});
