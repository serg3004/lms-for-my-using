import { describe, expect, it } from 'vitest';

import { readWorkbook, tableToRows, templateRows } from './importFile.js';

async function workbookBuffer(build: (sheet: import('exceljs').Worksheet) => void) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  build(workbook.addWorksheet('Users'));
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('readWorkbook', () => {
  it('reads the template written by the page back into rows', async () => {
    const buffer = await workbookBuffer((sheet) => sheet.addRows(templateRows('ru')));
    const result = tableToRows(await readWorkbook(buffer));
    expect('rows' in result && result.rows[0]?.values).toMatchObject({ email: 'aigul@example.com', lastName: 'Сарсенова', department: 'Отдел продаж', role: 'Ученик' });
  });

  it('never evaluates a formula cell: the row gets a problem and the value is dropped', async () => {
    const buffer = await workbookBuffer((sheet) => {
      sheet.addRow(['email', 'lastName', 'firstName', 'position']);
      sheet.addRow(['a@b.kz', 'A', 'B', { formula: '1+1', result: 2 }]);
      sheet.addRow(['c@d.kz', 'C', 'D', 'Cashier']);
    });
    const result = tableToRows(await readWorkbook(buffer));
    const rows = 'rows' in result ? result.rows : [];
    expect(rows[0]?.problems).toEqual([{ key: 'formula' }]);
    expect(rows[0]?.values.position).toBeUndefined();
    expect(rows[1]?.problems).toEqual([]);
    expect(rows[1]?.values.position).toBe('Cashier');
  });
});
