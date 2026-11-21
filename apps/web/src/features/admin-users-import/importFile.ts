import { usersImportResources } from '../../i18n/usersImportResources.js';

/** PR 492: reading, checking and reporting of a user import file. Pure functions; the page and the hook call them. */
export const importColumns = ['email', 'lastName', 'firstName', 'middleName', 'position', 'shift', 'phone', 'locale', 'department', 'role'] as const;
export type ImportColumn = (typeof importColumns)[number];
export const importLimits = { maxFileBytes: 2 * 1024 * 1024, maxRows: 1000, batchSize: 100 } as const;

export type ImportValues = Partial<Record<ImportColumn, string>>;
export type ImportProblem = { key: string; params?: Record<string, string | number> };
export type ImportRow = { line: number; values: ImportValues; problems: ImportProblem[] };
export type FileFailure = 'fileWrongType' | 'fileTooBig' | 'fileTooManyRows' | 'fileEmpty' | 'fileNoEmailColumn' | 'fileUnreadable';

/** A cell the person typed: every table cell is text, a formula cell of a workbook is marked by the reader. */
export type Table = { rows: string[][]; formulaCells: Set<string> };

export const formulaCellKey = (row: number, column: number) => `${row}:${column}`;

const headerAliases = new Map<string, ImportColumn>();
for (const column of importColumns) {
  headerAliases.set(column.toLowerCase(), column);
  for (const locale of ['en', 'ru', 'kk', 'zh'] as const) headerAliases.set(usersImportResources[locale].columns[column].trim().toLowerCase(), column);
}

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
export function tableToRows(table: Table): { rows: ImportRow[] } | { failure: FileFailure } {
  const headerIndex = table.rows.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (headerIndex < 0) return { failure: 'fileEmpty' };
  const columns = (table.rows[headerIndex] ?? []).map((cell) => headerAliases.get(cell.trim().toLowerCase()));
  if (!columns.includes('email')) return { failure: 'fileNoEmailColumn' };

  const rows: ImportRow[] = [];
  table.rows.slice(headerIndex + 1).forEach((cells, offset) => {
    if (!cells.some((cell) => cell.trim() !== '')) return;
    const rowIndex = headerIndex + 1 + offset;
    const values: ImportValues = {};
    const problems: ImportProblem[] = [];
    columns.forEach((column, columnIndex) => {
      if (!column) return;
      const value = (cells[columnIndex] ?? '').trim();
      if (table.formulaCells.has(formulaCellKey(rowIndex, columnIndex)) || formulaLike.test(value)) {
        if (!problems.some((problem) => problem.key === 'formula')) problems.push({ key: 'formula' });
        return;
      }
      if (value !== '') values[column] = value;
    });
    rows.push({ line: rowIndex + 1, values, problems });
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
    const missing = (['email', 'lastName', 'firstName'] as const).filter((column) => !row.values[column]);
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
};

export function serverProblem(message: string): ImportProblem {
  const key = serverProblems[message];
  return key ? { key } : { key: 'raw', params: { message } };
}

/** The row as the API takes it: only the filled columns, never a password (the person is invited). */
export function toApiRow(row: ImportRow): Record<string, string> {
  return Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== undefined && value !== '')) as Record<string, string>;
}

/** Template rows: the header in the given language and one sample line. */
export function templateRows(locale: 'en' | 'ru' | 'kk' | 'zh'): string[][] {
  const texts = usersImportResources[locale];
  return [importColumns.map((column) => texts.columns[column]), importColumns.map((column) => texts.sample[column])];
}

/** A cell of an exported CSV: quoted, and made harmless when a spreadsheet would read it as a formula. */
export function csvCell(value: string): string {
  const safe = /^[=@\t\r]|^[+-](?!\d)/.test(value) ? `'${value}` : value;
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
