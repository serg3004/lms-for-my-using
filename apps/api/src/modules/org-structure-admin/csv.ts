import { BadRequestException } from '@nestjs/common';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 32;
const MAX_FIELD_LENGTH = 2_048;

/** RFC-4180-compatible parser with explicit resource bounds and UTF-8 validation. */
export function parseCsv(buffer: Buffer): string[][] {
  if (buffer.length > MAX_CSV_BYTES) throw new BadRequestException('CSV exceeds the 5 MiB limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const pushField = () => {
    if (field.length > MAX_FIELD_LENGTH) throw new BadRequestException('CSV field exceeds 2048 characters');
    row.push(field.trim()); field = '';
    if (row.length > MAX_COLUMNS) throw new BadRequestException('CSV exceeds 32 columns');
  };
  const pushRow = () => {
    pushField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new BadRequestException('CSV exceeds 10000 data rows');
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') pushField();
    else if (char === '\n') pushRow();
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new BadRequestException('CSV contains an unterminated quoted field');
  if (field.length || row.length) pushRow();
  if (rows.length < 2) throw new BadRequestException('CSV must contain a header and at least one data row');
  return rows;
}

export function rowsAsObjects(rows: string[][], expected: readonly string[]): Record<string, string>[] {
  const [header, ...data] = rows;
  if (header!.length !== expected.length || header!.some((value, index) => value !== expected[index])) {
    throw new BadRequestException(`CSV header must be: ${expected.join(',')}`);
  }
  return data.map((values, index) => {
    if (values.length !== expected.length) throw new BadRequestException(`Row ${index + 2} has an invalid column count`);
    return Object.fromEntries(expected.map((key, column) => [key, values[column] ?? '']));
  });
}
