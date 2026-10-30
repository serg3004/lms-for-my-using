import { describe, expect, it } from 'vitest';
import { Workbook, ValueType } from 'exceljs';
import fixture from '../../../../tests/fixtures/checklist-session-summary-5s.json';
import { buildSummaryWorkbook } from './downloadSummaryXlsx.js';
import type { ChecklistSessionSummaryExport } from './api/types.js';

// Independent reference cells specify the workbook contract, without importing API code.
const loadTable = async (): Promise<Pick<ChecklistSessionSummaryExport, 'rows' | 'layout'>> => structuredClone(fixture.exportTable);

describe('summary XLSX (PR 373)', () => {
  it('round-trips the 5S golden workbook with reference cells, widths, frozen rows, merges and grey headings only', async () => {
    const workbook = await buildSummaryWorkbook(await loadTable());
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new Workbook(); await loaded.xlsx.load(buffer);
    expect(loaded.worksheets.map(({ name }) => name)).toEqual(['Worksheet 1']);
    const sheet = loaded.getWorksheet('Worksheet 1')!;
    for (const [address, value] of Object.entries(fixture.expectedCells)) expect(sheet.getCell(address).value).toBe(value);
    expect(sheet.columns.map(({ width }) => width)).toEqual([45, 16, 16, 16]);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 9, topLeftCell: 'A10' });
    expect(sheet.getCell('C9').master.address).toBe('B9');
    expect(sheet.getCell('A19').font.bold).toBe(true);
    expect(sheet.getCell('A19').fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FFE0E0E0' } });
    expect(sheet.getCell('A20').fill).not.toMatchObject({ pattern: 'solid' });
    expect(sheet.getCell('D20').alignment.wrapText).toBe(true);
    expect(sheet.getRow(20).height).toBeGreaterThanOrEqual(30);
  });
  it('reserves enough height for explicit newlines and full-width Chinese text', async () => {
    const table = await loadTable(); table.rows[19]![3] = '结果'.repeat(20);
    const workbook = await buildSummaryWorkbook(table);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getCell('D20').value).toBe('结果'.repeat(20));
    expect(sheet.getRow(20).height).toBeGreaterThanOrEqual(80);
  });
  it('stores formula-shaped text as text, with no formula or hyperlink cells', async () => {
    const table = await loadTable(); table.rows[5]![1] = '=HYPERLINK("bad")';
    const workbook = await buildSummaryWorkbook(table);
    const loaded = new Workbook(); await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = loaded.worksheets[0]!;
    expect(sheet.getCell('B6').value).toBe('=HYPERLINK("bad")');
    expect(sheet.getCell('B6').type).toBe(ValueType.String);
    sheet.eachRow((row) => row.eachCell((cell) => { expect(cell.formula).toBeUndefined(); expect(cell.hyperlink).toBeUndefined(); }));
  });
});
