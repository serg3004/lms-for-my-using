import { FIELD_LANGUAGES, type FieldLabels, type FieldOption, type FieldType, type FieldViewer, type UserFieldDefinition, type UserFieldInput } from '../../shared/api/userFields.js';

/** PR 500: the state of the field editor and its conversion to the API input. */
export type EditorOption = { key: string; labels: FieldLabels; archived: boolean; saved: boolean };
export type EditorState = {
  mode: 'create' | 'edit'; key: string; type: FieldType; labels: FieldLabels; required: boolean; unique: boolean; searchable: boolean;
  options: EditorOption[]; visible: Record<FieldViewer, boolean>; editable: Record<FieldViewer, boolean>;
};
export type EditorErrors = Partial<Record<'key' | 'labels' | 'options', string>>;

export const EMPTY_LABELS: FieldLabels = { ru: '', en: '', kk: '', zh: '' };
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const OPTION_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function emptyEditor(): EditorState {
  return {
    mode: 'create', key: '', type: 'text', labels: { ...EMPTY_LABELS }, required: false, unique: false, searchable: false, options: [],
    visible: { manager: true, self: true }, editable: { manager: false, self: false },
  };
}

export function editorFrom(field: UserFieldDefinition): EditorState {
  return {
    mode: 'edit', key: field.key, type: field.type, labels: { ...field.labels }, required: field.required, unique: field.unique, searchable: field.searchable,
    options: (field.options ?? []).map((option) => ({ key: option.key, labels: { ...option.labels }, archived: option.archived === true, saved: true })),
    visible: { manager: field.visibleTo.includes('manager'), self: field.visibleTo.includes('self') },
    editable: { manager: field.editableBy.includes('manager'), self: field.editableBy.includes('self') },
  };
}

const transliteration: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i' };

/** A key suggestion from a title: Latin letters, digits and underscores; Russian letters transliterated. */
export function suggestKey(title: string, taken: ReadonlySet<string> = new Set(), pattern: 'field' | 'option' = 'field'): string {
  const latin = [...title.toLowerCase()].map((char) => transliteration[char] ?? char).join('');
  const joiner = pattern === 'field' ? '_' : '-';
  let base = latin.replace(/[^a-z0-9]+/g, joiner).replace(new RegExp(`^${joiner}+|${joiner}+$`, 'g'), '').slice(0, 30);
  if (pattern === 'field' && !/^[a-z]/.test(base)) base = `f${joiner}${base}`.replace(new RegExp(`${joiner}$`), '');
  if (base.length < (pattern === 'field' ? 2 : 1)) base = pattern === 'field' ? 'field' : 'option';
  let key = base;
  for (let index = 2; taken.has(key); index += 1) key = `${base}${joiner}${index}`;
  return key;
}

/** The first filled title fills the languages the administrator left empty, so every language shows something. */
export function fillLabels(labels: FieldLabels): FieldLabels {
  const first = FIELD_LANGUAGES.map((language) => labels[language].trim()).find(Boolean) ?? '';
  return Object.fromEntries(FIELD_LANGUAGES.map((language) => [language, labels[language].trim() || first])) as FieldLabels;
}

export function validateEditor(state: EditorState): EditorErrors {
  const errors: EditorErrors = {};
  if (state.mode === 'create' && !KEY_PATTERN.test(state.key)) errors.key = 'key';
  if (!FIELD_LANGUAGES.some((language) => state.labels[language].trim())) errors.labels = 'labels';
  if (state.type === 'list') {
    const keys = state.options.map((option) => option.key);
    if (state.options.length === 0) errors.options = 'optionsEmpty';
    else if (state.options.some((option) => !FIELD_LANGUAGES.some((language) => option.labels[language].trim()) || !OPTION_KEY_PATTERN.test(option.key))) errors.options = 'optionsInvalid';
    else if (new Set(keys).size !== keys.length) errors.options = 'optionsDuplicate';
  }
  return errors;
}

export const hasEditorErrors = (errors: EditorErrors) => Object.keys(errors).length > 0;

export function toInput(state: EditorState): UserFieldInput {
  const visibleTo = (['manager', 'self'] as const).filter((viewer) => state.visible[viewer]);
  const editableBy = (['manager', 'self'] as const).filter((viewer) => state.visible[viewer] && state.editable[viewer]);
  const searchFits = state.type === 'text' || state.type === 'number' || state.type === 'phone';
  const options: FieldOption[] | undefined = state.type === 'list'
    ? state.options.map((option) => ({ key: option.key, labels: fillLabels(option.labels), ...(option.archived ? { archived: true } : {}) }))
    : undefined;
  return {
    key: state.key, type: state.type, labels: fillLabels(state.labels), required: state.required, unique: searchFits && state.unique, searchable: searchFits && state.searchable,
    ...(options ? { options } : {}), visibleTo: [...visibleTo], editableBy: [...editableBy],
  };
}
