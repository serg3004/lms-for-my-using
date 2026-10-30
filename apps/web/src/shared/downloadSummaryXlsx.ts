import type { ChecklistSessionSummaryExport } from './api/types.js';

/** Render the exact table authorized, calculated and audited by the server. No score math here. */
export async function buildSummaryWorkbook(data: Pick<ChecklistSessionSummaryExport, 'rows' | 'layout'>) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(data.layout.sheetName);
  sheet.addRows(data.rows);
  sheet.columns = data.layout.columnWidths.map((width) => ({ width }));
  sheet.views = [{ state: 'frozen', ySplit: data.layout.freezeRows, topLeftCell: 'A10', activeCell: 'A10' }];
  for (const merge of data.layout.merges) sheet.mergeCells(merge.startRow, merge.startColumn, merge.endRow, merge.endColumn);
  const headers = new Set(data.layout.headerRows);
  sheet.eachRow((row, number) => {
    let lines = 1;
    for (let column = 1; column <= data.layout.columnWidths.length; column += 1) {
      const cell = row.getCell(column);
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      cell.font = { name: 'Arial', size: 11, bold: headers.has(number) };
      cell.alignment = { wrapText: true, vertical: 'top' };
      // Strings remain text cells even when beginning with '='; never create formula/hyperlink objects.
      if (headers.has(number)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      const merge = data.layout.merges.find((range) => range.startRow === number && range.startColumn === column);
      const width = merge
        ? data.layout.columnWidths.slice(merge.startColumn - 1, merge.endColumn).reduce((sum, value) => sum + value, 0)
        : data.layout.columnWidths[column - 1] ?? 16;
      // Reserve extra width for Cyrillic/CJK glyphs and add explicit newline heights.
      const cellLines = String(cell.value ?? '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, 'XX').length / Math.max(1, width * 0.75))), 0);
      lines = Math.max(lines, cellLines);
    }
    row.height = Math.min(409, Math.max(20, lines * 16 + 4));
  });
  sheet.pageSetup = { paperSize: 9, orientation: data.layout.columnWidths.length > 4 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}

export async function downloadSummaryXlsx(data: ChecklistSessionSummaryExport) {
  const workbook = await buildSummaryWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = data.filename.replace(/\.csv$/, '.xlsx');
  document.body.appendChild(link);
  link.click(); link.remove(); URL.revokeObjectURL(url);
}
