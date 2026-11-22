import type { CustomFieldValues, FieldLabels, FieldLanguage, FieldOption, FieldType, UserFieldView } from '../../shared/api/userFields.js';
import { FIELD_LANGUAGES } from '../../shared/api/userFields.js';

/** PR 500: pure helpers shared by the settings page, the user form, the profile, the list and the import. */
export type FormValues = Record<string, string>;

export function languageOf(code: string | undefined): FieldLanguage {
  return FIELD_LANGUAGES.find((language) => (code ?? '').startsWith(language)) ?? 'ru';
}

export function fieldLabel(field: { labels: FieldLabels; key: string }, language: FieldLanguage): string {
  return field.labels[language] || field.labels.ru || field.labels.en || field.key;
}

export function optionLabel(option: FieldOption, language: FieldLanguage): string {
  return option.labels[language] || option.labels.ru || option.labels.en || option.key;
}

export const isEditable = (field: Pick<UserFieldView, 'editable'>) => field.editable !== false;

/** The API value as the text a form input holds. */
export function toFormValues(values: CustomFieldValues | undefined): FormValues {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [key, String(value)]));
}

/**
 * The `customFields` body of a create or update. Only fields the caller may change are sent; on update only the ones
 * that differ from what was loaded, an emptied one as `null`. Returns `undefined` when there is nothing to send.
 */
export function customFieldsPayload(fields: UserFieldView[], values: FormValues | undefined, original?: FormValues): Record<string, string | boolean | null> | undefined {
  const result: Record<string, string | boolean | null> = {};
  for (const field of fields) {
    if (!isEditable(field)) continue;
    const next = (values?.[field.key] ?? '').trim();
    const before = (original?.[field.key] ?? '').trim();
    if (original ? next === before : next === '') continue;
    result[field.key] = next === '' ? null : field.type === 'boolean' ? next === 'true' : next;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Titles of the required fields the caller must fill but left empty. */
export function missingRequired(fields: UserFieldView[], values: FormValues | undefined, language: FieldLanguage): string[] {
  return fields.filter((field) => field.required && isEditable(field) && !(values?.[field.key] ?? '').trim()).map((field) => fieldLabel(field, language));
}

/** A value for a table cell or a spreadsheet: a list shows the option title, a yes/no field the given words. */
export function displayValue(field: UserFieldView, raw: string | number | boolean | undefined, language: FieldLanguage, yes: string, no: string): string {
  if (raw === undefined || raw === '') return '';
  if (field.type === 'boolean') return raw === true || raw === 'true' ? yes : no;
  if (field.type === 'list') {
    const option = field.options?.find((item) => item.key === raw);
    return option ? optionLabel(option, language) : String(raw);
  }
  return String(raw);
}

/** Options a person may pick: the active ones, plus the archived one they already hold. */
export function pickableOptions(field: Pick<UserFieldView, 'options'>, current: string | undefined): FieldOption[] {
  return (field.options ?? []).filter((option) => !option.archived || option.key === current);
}

export const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'list', 'phone', 'boolean'];
export const TYPES_WITH_SEARCH: FieldType[] = ['text', 'number', 'phone'];

const yesWords = new Set(['true', 'yes', 'y', '1', 'да', 'иә', '是']);
const noWords = new Set(['false', 'no', 'n', '0', 'нет', 'жоқ', '否']);

/**
 * A cell of an import file turned into what the API takes: a list value by its title in any language, a yes/no by common
 * words, a date written day.month.year as an ISO date. Anything else is sent as typed and the server judges it.
 */
export function importCellValue(field: UserFieldView, raw: string): string {
  const text = raw.trim();
  if (field.type === 'list') {
    const lower = text.toLowerCase();
    const option = field.options?.find((item) => item.key.toLowerCase() === lower || FIELD_LANGUAGES.some((language) => item.labels[language].trim().toLowerCase() === lower));
    return option ? option.key : text;
  }
  if (field.type === 'boolean') {
    const lower = text.toLowerCase();
    return yesWords.has(lower) ? 'true' : noWords.has(lower) ? 'false' : text;
  }
  if (field.type === 'date') {
    const match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
    if (match) return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  }
  return text;
}

/** Header names an import file may use for a field: its key and its title in every language. */
export function headerNames(field: Pick<UserFieldView, 'key' | 'labels'>): string[] {
  return [field.key, ...FIELD_LANGUAGES.map((language) => field.labels[language])].map((name) => name.trim().toLowerCase()).filter(Boolean);
}
