import { usersImportResources } from '../../i18n/usersImportResources.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { fieldLabel, headerNames, importCellValue } from '../user-fields/model.js';

/** PR 492: reading, checking and reporting of a user import file. Pure functions; the page and the hook call them. */
export const importColumns = ['email', 'lastName', 'firstName', 'middleName', 'position', 'shift', 'phone', 'locale', 'department', 'role'] as const;
export type ImportColumn = (typeof importColumns)[number];
export const importLimits = { maxFileBytes: 2 * 1024 * 1024, maxRows: 1000, batchSize: 100 } as const;

export type ImportValues = Partial<Record<ImportColumn, string>>;
export type ImportProblem = { key: string; params?: Record<string, string | number> };
/** PR 500: `custom` holds the cells of custom field columns by field key, already turned into what the API takes. PR 501: `activate` is the row's "activation by employee number" cell. */
export type ImportRow = { line: number; values: ImportValues; problems: ImportProblem[]; custom?: Record<string, string>; activate?: boolean };
export type FileFailure = 'fileWrongType' | 'fileTooBig' | 'fileTooManyRows' | 'fileEmpty' | 'fileNoEmailColumn' | 'fileUnreadable';

/** A cell the person typed: every table cell is text, a formula cell of a workbook is marked by the reader. */
export type Table = { rows: string[][]; formulaCells: Set<string> };

export const formulaCellKey = (row: number, column: number) => `${row}:${column}`;

const headerAliases = new Map<string, ImportColumn>();
for (const column of importColumns) {
  headerAliases.set(column.toLowerCase(), column);
  for (const locale of ['en', 'ru', 'kk', 'zh'] as const) headerAliases.set(usersImportResources[locale].columns[column].trim().toLowerCase(), column);
}

/** PR 501: names of the optional column that lets a row without an email activate by employee number (not part of the template). */
const activationHeaders = new Set(['activatebyidentity', 'activation by employee number', 'активация по табельному номеру', 'табель нөмірі арқылы белсендіру', '按工号激活']);
const yesWords = new Set(['yes', 'y', 'true', '1', 'да', 'иә', 'ия', '是']);
export const isYes = (value: string) => yesWords.has(value.trim().toLowerCase());

/** Splits CSV text into rows of cells: quotes, doubled quotes, a BOM and the delimiter (comma, semicolon or tab) of the first line. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].map((candidate) => [candidate, firstLine.split(candidate).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** Reads the first sheet of a workbook. A formula cell is never evaluated: its position is returned so the row can be refused. */
export async function readWorkbook(buffer: ArrayBuffer): Promise<Table> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  const formulaCells = new Set<string>();
  sheet?.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const value = cell.value;
      const isFormula = typeof value === 'object' && value !== null && ('formula' in value || 'sharedFormula' in value);
      if (isFormula) formulaCells.add(formulaCellKey(rowNumber - 1, columnNumber - 1));
      cells[columnNumber - 1] = isFormula ? '' : cell.text.trim();
    });
    rows[rowNumber - 1] = Array.from(cells, (cell) => cell ?? '');
  });
  return { rows: Array.from(rows, (row) => row ?? []), formulaCells };
}

const formulaLike = /^[=@]|^[+-](?!\d)/;

/** Rows of people from a table: the header row is found by names in any language; empty rows are skipped. */
export function tableToRows(table: Table, fields: UserFieldView[] = []): { rows: ImportRow[] } | { failure: FileFailure } {
  const headerIndex = table.rows.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (headerIndex < 0) return { failure: 'fileEmpty' };
  // A standard column name wins over a custom field that happens to carry the same title.
  const fieldByHeader = new Map<string, UserFieldView>();
  for (const field of fields) for (const name of headerNames(field)) if (!headerAliases.has(name) && !fieldByHeader.has(name)) fieldByHeader.set(name, field);
  const headerCells = (table.rows[headerIndex] ?? []).map((cell) => cell.trim().toLowerCase());
  const columns = headerCells.map((cell) => headerAliases.get(cell));
  const activationColumn = headerCells.findIndex((cell) => activationHeaders.has(cell));
  const customColumns = headerCells.map((cell) => (headerAliases.has(cell) || activationHeaders.has(cell) ? undefined : fieldByHeader.get(cell)));
  if (!columns.includes('email')) return { failure: 'fileNoEmailColumn' };

  const rows: ImportRow[] = [];
  table.rows.slice(headerIndex + 1).forEach((cells, offset) => {
    if (!cells.some((cell) => cell.trim() !== '')) return;
    const rowIndex = headerIndex + 1 + offset;
    const values: ImportValues = {};
    const problems: ImportProblem[] = [];
    const custom: Record<string, string> = {};
    columns.forEach((column, columnIndex) => {
      const field = customColumns[columnIndex];
      if (!column && !field) return;
      const value = (cells[columnIndex] ?? '').trim();
      if (table.formulaCells.has(formulaCellKey(rowIndex, columnIndex)) || formulaLike.test(value)) {
        if (!problems.some((problem) => problem.key === 'formula')) problems.push({ key: 'formula' });
        return;
      }
      if (value === '') return;
      if (column) values[column] = value;
      else if (field) custom[field.key] = importCellValue(field, value);
    });
    const activate = activationColumn >= 0 && isYes(cells[activationColumn] ?? '');
    rows.push({ line: rowIndex + 1, values, problems, ...(Object.keys(custom).length > 0 ? { custom } : {}), ...(activate ? { activate: true } : {}) });
  });
  if (rows.length === 0) return { failure: 'fileEmpty' };
  if (rows.length > importLimits.maxRows) return { failure: 'fileTooManyRows' };
  return { rows };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problems visible without the server: required names, the email shape, an email repeated in the file. Rows with a problem are not sent. */
export function checkRowsLocally(rows: ImportRow[], fieldNames: (column: ImportColumn) => string): ImportRow[] {
  const firstLine = new Map<string, number>();
  return rows.map((row) => {
    const problems = [...row.problems];
    // PR 501: a row that activates by employee number may leave the email empty.
    const missing = (['email', 'lastName', 'firstName'] as const).filter((column) => !row.values[column] && !(column === 'email' && row.activate));
    if (missing.length > 0) problems.push({ key: 'required', params: { fields: missing.map(fieldNames).join(', ') } });
    const email = row.values.email?.toLowerCase();
    if (email) {
      if (!emailPattern.test(email)) problems.push({ key: 'invalidEmail' });
      else if (firstLine.has(email)) problems.push({ key: 'duplicateInFile', params: { line: firstLine.get(email)! } });
      else firstLine.set(email, row.line);
    }
    return { ...row, problems };
  });
}

/** Server messages of the import report mapped to texts; an unknown message is shown as it came. */
const serverProblems: Record<string, string> = {
  'User email already exists in organization': 'alreadyExists',
  'Duplicate user email in import payload': 'duplicate',
  'Department not found': 'departmentMissing',
  'The department is outside your area': 'departmentOutside',
  'Department name is ambiguous': 'departmentAmbiguous',
  'Department is required': 'departmentRequired',
  'Role not found': 'roleMissing',
  'Roles are granted by an administrator': 'roleForbidden',
  'Without an email choose activation by employee number': 'noEmailNeedsActivation',
  'Activation by employee number cannot be combined with a password': 'activationWithPassword',
  'The employee number is required for a person without an email or with activation by employee number': 'employeeNumberRequired',
};

const fieldProblems: Array<[RegExp, string]> = [
  [/^The field "([^"]+)" is required$/, 'required'], [/^The value of "([^"]+)" is not valid$/, 'invalid'], [/^The value of "([^"]+)" is not one of the options$/, 'option'],
  [/^The value of "([^"]+)" is too long$/, 'tooLong'], [/^The value of "([^"]+)" repeats in the import$/, 'repeats'], [/^The value of "([^"]+)" is already used by another person$/, 'taken'],
  [/^The field "([^"]+)" cannot be changed by you$/, 'forbidden'], [/^Unknown field "([^"]+)"$/, 'unknown'],
];

export function serverProblem(message: string): ImportProblem {
  const key = serverProblems[message];
  if (key) return { key };
  for (const [pattern, kind] of fieldProblems) {
    const match = pattern.exec(message);
    if (match) return { key: 'field', params: { kind, field: match[1]! } };
  }
  return { key: 'raw', params: { message } };
}

/** The row as the API takes it: only the filled columns, never a password (the person is invited). */
export function toApiRow(row: ImportRow): Record<string, unknown> {
  const standard = Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== undefined && value !== ''));
  return { ...standard, ...(row.activate ? { activateByIdentity: true } : {}), ...(row.custom && Object.keys(row.custom).length > 0 ? { customFields: row.custom } : {}) };
}

/** Template rows: the header in the given language and one sample line. */
export function templateRows(locale: 'en' | 'ru' | 'kk' | 'zh', fields: UserFieldView[] = []): string[][] {
  const texts = usersImportResources[locale];
  const editable = fields.filter((field) => field.editable !== false);
  return [[...importColumns.map((column) => texts.columns[column]), ...editable.map((field) => fieldLabel(field, locale))], [...importColumns.map((column) => texts.sample[column]), ...editable.map(() => '')]];
}

/** A text made harmless when a spreadsheet would read it as a formula. */
export function formulaSafe(value: string): string {
  return /^[=@\t\r]|^[+-](?!\d)/.test(value) ? `'${value}` : value;
}

/** A cell of an exported CSV: quoted, and made harmless when a spreadsheet would read it as a formula. */
export function csvCell(value: string): string {
  const safe = formulaSafe(value);
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
