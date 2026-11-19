/** PR 336: hands a server-built CSV (already escaped and audited) to the browser as a file download. */
export function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type ReportCell = string | number;

/** PR 336: .xlsx built in the browser from the exact rows the server scoped and audited. */
/** `styled` (PR 475): grey header, frozen first row and widths that fit the content; the other exports keep the plain look. */
export async function downloadXlsxFile(filename: string, rows: ReportCell[][], sheetName: string, options: { styled?: boolean } = {}) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  worksheet.addRows(rows);
  worksheet.getRow(1).font = { bold: true };
  if (options.styled) {
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    worksheet.getRow(1).alignment = { wrapText: true, vertical: 'top' };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  worksheet.columns.forEach((column, index) => {
    // The note under the table is one long cell; it must not widen the first column.
    const longest = Math.max(...rows.filter((row) => row.length > 1).map((row) => String(row[index] ?? '').length), 8);
    column.width = Math.min(longest + 2, 48);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/\.csv$/, '.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
