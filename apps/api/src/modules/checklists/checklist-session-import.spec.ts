import ExcelJS from 'exceljs';
import { MAX_SESSION_IMPORT_BYTES, parseSessionImport } from './checklist-session-import.js';

const csv = (text: string) => ({ originalname: 'employees.csv', buffer: Buffer.from(text) });
async function xlsx(values: ExcelJS.CellValue[], extraSheet = false) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Employees');
  values.forEach((value, index) => { sheet.getCell(index + 1, 1).value = value; });
  if (extraSheet) book.addWorksheet('Other');
  return { originalname: 'employees.xlsx', buffer: Buffer.from(await book.xlsx.writeBuffer()) };
}

describe('session employee import file validation (PR 364)', () => {
  it('reads BOM, UTF-8, quotes, CRLF, normalizes emails and reports duplicate/invalid rows in file order', async () => {
    const rows = await parseSessionImport(csv('\uFEFFemail\r\n" ALICE@EXAMPLE.COM "\r\nalice@example.com\r\n=2+2\r\n'));
    expect(rows.map((row) => [row.row, row.email, row.reason])).toEqual([[2, 'alice@example.com', undefined], [3, 'alice@example.com', 'duplicate'], [4, '=2+2', 'invalid_email']]);
  });
  it('accepts exactly 100 rows', async () => { expect(await parseSessionImport(csv('email\n' + Array.from({ length: 100 }, (_, i) => `u${i}@example.com`).join('\n')))).toHaveLength(100); });
  it.each([
    ['email\n' + Array(101).fill('u@example.com').join('\n'), 'rows_limit'],
    ['name\na@example.com', 'header'], ['email,name\na@example.com,A', 'header'],
    ['email\n"a@example.com', 'invalid_file'], ['email\n"a@example.com"junk', 'invalid_file'], ['email\n', 'empty'],
  ])('rejects an invalid CSV structure: %s', async (text, reason) => { await expect(parseSessionImport(csv(text))).rejects.toThrow(`session_import.${reason}`); });
  it('rejects invalid UTF-8, missing files, wrong extensions and oversized files', async () => {
    await expect(parseSessionImport({ ...csv(''), buffer: Buffer.from([255]) })).rejects.toThrow('invalid_file');
    await expect(parseSessionImport()).rejects.toThrow('empty');
    await expect(parseSessionImport({ originalname: 'x.xls', buffer: Buffer.from('email\na@example.com') })).rejects.toThrow('format');
    await expect(parseSessionImport({ ...csv(''), buffer: Buffer.alloc(MAX_SESSION_IMPORT_BYTES + 1) })).rejects.toThrow('file_limit');
  });
  it('reads literal XLSX cells and rejects formula, hyperlink and numeric cells without evaluation', async () => {
    const rows = await parseSessionImport(await xlsx(['email', 'a@example.com', { formula: 'CONCAT("b","@example.com")', result: 'b@example.com' }, { text: 'c@example.com', hyperlink: 'https://example.com' }, 42]));
    expect(rows.map((row) => row.reason)).toEqual([undefined, 'invalid_email', 'invalid_email', 'invalid_email']);
  });
  it('rejects extra sheets, wrong Excel header and invalid ZIP data', async () => {
    await expect(parseSessionImport(await xlsx(['email', 'a@example.com'], true))).rejects.toThrow('one_sheet');
    await expect(parseSessionImport(await xlsx(['name', 'a@example.com']))).rejects.toThrow('header');
    await expect(parseSessionImport({ originalname: 'bad.xlsx', buffer: Buffer.from('PK\x03\x04garbage') })).rejects.toThrow('invalid_file');
  });
  it('bounds actual decompression even if ZIP metadata lies about the expanded size', async () => {
    const file = await xlsx(['email', 'x'.repeat(9 * 1024 * 1024)]);
    // Pretend every central-directory entry is tiny; actual inflate remains bounded.
    for (let i = 0; i < file.buffer.length - 46; i++) if (file.buffer.readUInt32LE(i) === 0x02014b50 && file.buffer.readUInt32LE(i + 24) > 8 * 1024 * 1024) file.buffer.writeUInt32LE(1, i + 24);
    await expect(parseSessionImport(file)).rejects.toThrow('invalid_file');
  });
  it('rejects sparse worksheets with a huge row address before ExcelJS allocates them', async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Employees');
    sheet.getCell('A1').value = 'email'; sheet.getCell('A1000000').value = 'a@example.com';
    await expect(parseSessionImport({ originalname: 'sparse.xlsx', buffer: Buffer.from(await book.xlsx.writeBuffer()) })).rejects.toThrow('rows_limit');
  });
  it('bounds rejected Excel email text in the row report', async () => {
    const rows = await parseSessionImport(await xlsx(['email', 'x'.repeat(1000)]));
    expect(rows[0].reason).toBe('invalid_email'); expect(rows[0].email.length).toBeLessThanOrEqual(255);
  });

});
