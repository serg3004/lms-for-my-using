/**
 * PR 499: the rules of one custom user field value, as pure functions: what a value of each type may look like, how it is stored,
 * how it is compared (search, filters, uniqueness) and who may see or change it. No database access here.
 */
export const FIELD_LANGUAGES = ['ru', 'en', 'kk', 'zh'] as const;
export type FieldLabels = Record<(typeof FIELD_LANGUAGES)[number], string>;
export type FieldOption = { key: string; labels: FieldLabels; archived?: boolean };
export type FieldType = 'text' | 'number' | 'date' | 'list' | 'phone' | 'boolean';
/** Who looks at or changes a value. The administrator is always allowed; `manager` is everyone else on the staff routes. */
export type FieldViewer = 'admin' | 'manager' | 'self';

export type FieldDefinition = {
  id: string;
  key: string;
  labels: FieldLabels;
  type: FieldType;
  required: boolean;
  isUnique: boolean;
  searchable: boolean;
  options: FieldOption[] | null;
  visibleTo: string[];
  editableBy: string[];
  sortOrder: number;
  archivedAt: Date | null;
};

export const WORK_SCHEDULE_KEY = 'work_schedule';
export const TEXT_MAX_LENGTH = 500;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{3,24}$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const NUMBER_LIMIT = 1e12;

export type NormalizedValue = { value: string; normalized: string };
export type NormalizeFailure = 'invalid' | 'option' | 'tooLong';
export type NormalizeResult = ({ ok: true } & NormalizedValue) | { ok: false; code: NormalizeFailure };

export function canSeeField(definition: Pick<FieldDefinition, 'visibleTo'>, viewer: FieldViewer): boolean {
  return viewer === 'admin' || definition.visibleTo.includes(viewer);
}

export function canEditField(definition: Pick<FieldDefinition, 'visibleTo' | 'editableBy'>, viewer: FieldViewer): boolean {
  return viewer === 'admin' || (definition.editableBy.includes(viewer) && definition.visibleTo.includes(viewer));
}

/** An empty input (null, an empty or blank string) means "no value". */
export function isEmptyInput(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Digits and a leading plus only: "+7 (701) 123-45-67" and "+77011234567" are the same number. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}

/** The comparable form of free text: trimmed, inner whitespace collapsed, lower case. */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Checks `raw` against the field's type and returns the stored value and its comparable form.
 * `current` is the value the user already has: an archived list option stays valid for the person who holds it.
 */
export function normalizeFieldValue(definition: Pick<FieldDefinition, 'type' | 'options'>, raw: unknown, current?: string): NormalizeResult {
  switch (definition.type) {
    case 'text': {
      if (typeof raw !== 'string') return { ok: false, code: 'invalid' };
      const value = raw.trim();
      if (value.length > TEXT_MAX_LENGTH) return { ok: false, code: 'tooLong' };
      return { ok: true, value, normalized: normalizeText(value) };
    }
    case 'number': {
      const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
      if (!NUMBER_PATTERN.test(text)) return { ok: false, code: 'invalid' };
      const parsed = Number(text);
      if (!Number.isFinite(parsed) || Math.abs(parsed) > NUMBER_LIMIT) return { ok: false, code: 'invalid' };
      const canonical = String(parsed);
      return { ok: true, value: canonical, normalized: canonical };
    }
    case 'date': {
      if (typeof raw !== 'string' || !validDate(raw.trim())) return { ok: false, code: 'invalid' };
      return { ok: true, value: raw.trim(), normalized: raw.trim() };
    }
    case 'phone': {
      if (typeof raw !== 'string' || !PHONE_PATTERN.test(raw.trim())) return { ok: false, code: 'invalid' };
      return { ok: true, value: raw.trim(), normalized: normalizePhone(raw) };
    }
    case 'boolean': {
      const text = typeof raw === 'boolean' ? String(raw) : typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (text !== 'true' && text !== 'false') return { ok: false, code: 'invalid' };
      return { ok: true, value: text, normalized: text };
    }
    case 'list': {
      if (typeof raw !== 'string') return { ok: false, code: 'invalid' };
      const key = raw.trim();
      const option = (definition.options ?? []).find((item) => item.key === key);
      if (!option || (option.archived && current !== key)) return { ok: false, code: 'option' };
      return { ok: true, value: key, normalized: key };
    }
  }
}

/** The value as the API returns it: numbers and booleans typed, everything else as the stored text. */
export function presentFieldValue(type: FieldType, stored: string): string | number | boolean {
  if (type === 'number') return Number(stored);
  if (type === 'boolean') return stored === 'true';
  return stored;
}

/** What a search box text is compared with: the lower-case text, plus the digits-only form for phone-like input. */
export function searchTerms(search: string): string[] {
  const text = normalizeText(search);
  const digits = search.replace(/\D/g, '');
  return [...new Set([text, ...(digits.length >= 3 ? [normalizePhone(search)] : [])])].filter((term) => term.length > 0);
}

/** The title of an option, used to write the old `shift` text back from a work schedule value. */
export function optionTitle(option: FieldOption): string {
  return option.labels.ru || option.labels.en;
}

/** An option key made from a title: lower-case letters and digits, always starting with a letter or digit. */
export function optionKeyFromTitle(title: string, taken: ReadonlySet<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const start = base.length > 0 ? base : 'option';
  let key = start;
  for (let index = 2; taken.has(key); index += 1) key = `${start}-${index}`;
  return key;
}

/** Audit detail of field changes: the keys always, old and new values only for unique fields (e.g. the employee number). */
export function fieldAuditMetadata(changes: ReadonlyArray<{ key: string; from: unknown; to: unknown; unique: boolean }>) {
  if (changes.length === 0) return {};
  return {
    customFields: changes.map((change) => change.key),
    ...(changes.some((change) => change.unique) ? { customFieldChanges: changes.filter((change) => change.unique).map(({ key, from, to }) => ({ key, from, to })) } : {}),
  };
}
