import { describe, expect, it } from 'vitest';

import { checkRowsLocally, csvCell, formulaCellKey, parseCsv, serverProblem, tableToRows, templateRows, toApiRow, toCsv, type ImportRow } from './importFile.js';

const names = (column: string) => column;
const rowsOf = (result: ReturnType<typeof tableToRows>) => ('rows' in result ? result.rows : []);

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, a BOM and a semicolon delimiter', () => {
    expect(parseCsv('﻿email;Фамилия\r\n"a@b.kz";"Ли ""Ли"", Ким"\r\n')).toEqual([['email', 'Фамилия'], ['a@b.kz', 'Ли "Ли", Ким']]);
  });

  it('keeps a quoted line break inside the cell and a last row without a line break', () => {
    expect(parseCsv('a,b\n"x\ny",z')).toEqual([['a', 'b'], ['x\ny', 'z']]);
  });
});

describe('tableToRows', () => {
  it('recognizes the template header in every language and skips empty rows', () => {
    for (const locale of ['en', 'ru', 'kk', 'zh'] as const) {
      const result = tableToRows({ rows: [...templateRows(locale), ['', '', ''], []], formulaCells: new Set() });
      expect(rowsOf(result)).toHaveLength(1);
      expect(rowsOf(result)[0]?.values.email).toBe('aigul@example.com');
      expect(rowsOf(result)[0]?.line).toBe(2);
    }
  });

  it('fails without an email column or without people', () => {
    expect(tableToRows({ rows: [['Name'], ['x']], formulaCells: new Set() })).toEqual({ failure: 'fileNoEmailColumn' });
    expect(tableToRows({ rows: [['email']], formulaCells: new Set() })).toEqual({ failure: 'fileEmpty' });
    expect(tableToRows({ rows: [], formulaCells: new Set() })).toEqual({ failure: 'fileEmpty' });
  });

  it('refuses more rows than the limit', () => {
    const rows = [['email'], ...Array.from({ length: 1001 }, (_, index) => [`u${index}@x.kz`])];
    expect(tableToRows({ rows, formulaCells: new Set() })).toEqual({ failure: 'fileTooManyRows' });
  });

  it('marks formula cells and values that start with a formula sign, but not a phone number', () => {
    const result = rowsOf(tableToRows({
      rows: [['email', 'phone', 'position'], ['a@b.kz', '+7 700 111', '=1+1'], ['c@d.kz', '', 'x'], ['e@f.kz', '', '@SUM(A1)']],
      formulaCells: new Set([formulaCellKey(2, 2)]),
    }));
    expect(result[0]?.problems).toEqual([{ key: 'formula' }]);
    expect(result[0]?.values.phone).toBe('+7 700 111');
    expect(result[1]?.problems).toEqual([{ key: 'formula' }]);
    expect(result[2]?.problems).toEqual([{ key: 'formula' }]);
    expect(result[0]?.values.position).toBeUndefined();
  });
});

describe('checkRowsLocally', () => {
  const row = (line: number, values: ImportRow['values']): ImportRow => ({ line, values, problems: [] });

  it('names missing fields, a bad email and an email repeated in the file', () => {
    const checked = checkRowsLocally([
      row(2, { email: 'a@b.kz', lastName: 'A', firstName: 'B' }),
      row(3, { email: 'A@b.kz', lastName: 'A', firstName: 'B' }),
      row(4, { email: 'nope', lastName: 'A' }),
    ], names);
    expect(checked[0]?.problems).toEqual([]);
    expect(checked[1]?.problems).toEqual([{ key: 'duplicateInFile', params: { line: 2 } }]);
    expect(checked[2]?.problems).toEqual([{ key: 'required', params: { fields: 'firstName' } }, { key: 'invalidEmail' }]);
  });
});

describe('export helpers', () => {
  it('turns a formula-like cell into text and quotes separators', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+7 700 111')).toBe('+7 700 111');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(toCsv([['a', '-x']])).toBe('﻿a,\'-x\r\n');
  });

  it('sends only filled columns and never a password', () => {
    expect(toApiRow({ line: 2, problems: [], values: { email: 'a@b.kz', lastName: 'A', firstName: 'B', position: '' } })).toEqual({ email: 'a@b.kz', lastName: 'A', firstName: 'B' });
  });

  it('maps known server messages and keeps unknown ones', () => {
    expect(serverProblem('Department not found')).toEqual({ key: 'departmentMissing' });
    expect(serverProblem('Something new')).toEqual({ key: 'raw', params: { message: 'Something new' } });
  });
});
