import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { buildAssessmentExport, exportLabels, type ExportLocale } from './assessment-export-file.js';

const locales = Object.keys(exportLabels) as ExportLocale[];

describe('assessment export formats', () => {
  it.each(locales)('reads the %s workbook as XLSX and preserves literal cell values', async (locale) => {
    const labels = exportLabels[locale];
    const table = { label: labels.questions, title: 'Тест 测试', headers: labels.questionColumns,
      widths: [250, 70, 75, 90, 220, 77], rows: [['=1+1', 5, 4, 80, 'Қате', 1]] };
    const file = await buildAssessmentExport('xlsx', table);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from([file]));
    const sheet = workbook.getWorksheet(labels.questions)!;
    expect(sheet.getCell('A1').value).toBe(table.title);
    expect(sheet.getCell('A2').value).toBe(labels.questionColumns[0]);
    expect(sheet.getCell('A3').value).toBe('=1+1');
    expect(sheet.getCell('D3').value).toBe(80);
    expect(sheet.getCell('E3').value).toBe('Қате');
  });

  it('writes a multipage PDF with mixed Chinese and Kazakh text', async () => {
    const labels = exportLabels.zh;
    const file = await buildAssessmentExport('pdf', {
      label: labels.questions, title: '测试 · Қазақша', headers: labels.questionColumns,
      widths: [250, 70, 75, 90, 220, 77], rows: Array.from({ length: 65 }, (_, index) =>
        [`题目 ${index + 1} · Жауап`, 4, 3, 75, '长选项'.repeat(20), 1]),
    });
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.toString('latin1').trimEnd()).toMatch(/%%EOF$/);
    expect(file.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
});
