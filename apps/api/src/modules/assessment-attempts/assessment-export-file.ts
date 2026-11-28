import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PdfFontBook } from '../checklists/public.js';

export type ExportLocale = 'ru' | 'en' | 'kk' | 'zh';
export type ExportFormat = 'xlsx' | 'pdf';
export type ExportView = 'results' | 'questions' | 'folder';
type Cell = string | number | null;

export const exportLabels = {
  en: {
    results: 'Test results', questions: 'Question analysis', folder: 'Folder summary',
    resultColumns: ['Employee', 'Department', 'Attempt', 'Score', 'Status', 'Date', 'Place'],
    questionColumns: ['Question', 'Answers', 'Correct', 'Correct answers (%)', 'Top wrong answer', 'Selections'],
    folderColumns: ['Test', 'Attempts', 'Passed', 'Pass rate (%)', 'Average score (%)'],
    passed: 'Passed', failed: 'Failed', standalone: 'Standalone', course: 'Course', longread: 'Longread',
    survey: 'Survey results', surveyColumns: ['Employee', 'Date (UTC)'],
    untitledQuestion: 'Untitled question', untitledOption: 'Untitled option',
  },
  ru: {
    results: 'Результаты теста', questions: 'Анализ вопросов', folder: 'Сводка по папке',
    resultColumns: ['Сотрудник', 'Подразделение', 'Попытка', 'Балл', 'Статус', 'Дата', 'Место'],
    questionColumns: ['Вопрос', 'Ответы', 'Верные', 'Верные ответы (%)', 'Частый неверный ответ', 'Выборы'],
    folderColumns: ['Тест', 'Попытки', 'Сдали', 'Процент сдачи (%)', 'Средний балл (%)'],
    passed: 'Сдан', failed: 'Не сдан', standalone: 'Самостоятельно', course: 'Курс', longread: 'Лонгрид',
    survey: 'Результаты опроса', surveyColumns: ['Сотрудник', 'Дата (UTC)'],
    untitledQuestion: 'Вопрос без названия', untitledOption: 'Вариант без названия',
  },
  kk: {
    results: 'Тест нәтижелері', questions: 'Сұрақтарды талдау', folder: 'Қалта бойынша жиынтық',
    resultColumns: ['Қызметкер', 'Бөлімше', 'Талпыныс', 'Ұпай', 'Мәртебе', 'Күні', 'Өту орны'],
    questionColumns: ['Сұрақ', 'Жауаптар', 'Дұрыс жауаптар', 'Дұрыс жауаптар (%)', 'Жиі таңдалған қате жауап', 'Таңдау саны'],
    folderColumns: ['Тест', 'Талпыныстар', 'Өткендер', 'Өту үлесі (%)', 'Орташа ұпай (%)'],
    passed: 'Өтті', failed: 'Өтпеді', standalone: 'Өз бетінше', course: 'Курс', longread: 'Лонгрид',
    survey: 'Сауалнама нәтижелері', surveyColumns: ['Қызметкер', 'Күні (UTC)'],
    untitledQuestion: 'Атаусыз сұрақ', untitledOption: 'Атаусыз нұсқа',
  },
  zh: {
    results: '测试结果', questions: '题目分析', folder: '文件夹汇总',
    resultColumns: ['员工', '部门', '作答记录', '得分', '状态', '日期', '参加方式'],
    questionColumns: ['题目', '作答数', '答对数', '正确率 (%)', '最常选的错误答案', '选择次数'],
    folderColumns: ['测试', '作答次数', '通过次数', '通过率 (%)', '平均得分 (%)'],
    passed: '已通过', failed: '未通过', standalone: '独立测试', course: '课程', longread: '长文',
    survey: '调查结果', surveyColumns: ['员工', '日期 (UTC)'],
    untitledQuestion: '未命名题目', untitledOption: '未命名选项',
  },
} satisfies Record<ExportLocale, Record<string, string | string[]>>;

export type ExportTable = { label: string; title: string; headers: string[]; rows: Cell[][]; widths: number[] };

export const exportMime = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

export async function buildAssessmentExport(format: ExportFormat, table: ExportTable): Promise<Buffer> {
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(table.label, { views: [{ state: 'frozen', ySplit: 2 }] });
    sheet.columns = table.widths.map((width) => ({ width: Math.max(14, Math.round(width / 5)), style: { alignment: { vertical: 'top', wrapText: true } } }));
    sheet.addRow([table.title]).font = { bold: true };
    sheet.mergeCells(1, 1, 1, table.headers.length);
    sheet.addRow(table.headers).font = { bold: true };
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + table.rows.length, column: table.headers.length } };
    for (const row of table.rows) sheet.addRow(row);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  const fonts = new PdfFontBook(pdf);
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.once('end', () => resolve(Buffer.concat(chunks)));
    pdf.once('error', reject);
  });

  const margin = 28;
  const limit = pdf.page.height - margin;
  const width = table.widths.reduce((sum, column) => sum + column, 0);
  const options = { size: 9, color: '#172234' };
  const lineHeight = fonts.height('A', { ...options, width: 100 });
  let y = margin;

  function writeLines(lines: string[][], bold: boolean, offset: number, count: number) {
    let x = margin;
    table.widths.forEach((column, index) => {
      lines[index]?.slice(offset, offset + count).forEach((line, row) => {
        fonts.writeInline(line, { ...options, weight: bold ? 700 : 400, x: x + 4, y: y + 4 + row * lineHeight });
      });
      x += column;
    });
    y += count * lineHeight + 8;
    pdf.moveTo(margin, y).lineTo(margin + width, y).strokeColor('#cbd5e1').stroke();
  }

  const wrap = (cells: Cell[], bold: boolean) => cells.map((cell, index) =>
    fonts.wrap(String(cell ?? '—'), bold ? 700 : 400, options.size, table.widths[index]! - 8));
  const headers = wrap(table.headers, true);
  function writeHeader(newPage: boolean) {
    if (newPage) pdf.addPage();
    y = margin;
    const title = newPage ? table.label : `${table.label} — ${table.title}`;
    const heading = { ...options, size: 13, weight: 700 as const, width };
    fonts.write(title, { ...heading, x: margin, y });
    y += fonts.height(title, heading) + 8;
    writeLines(headers, true, 0, Math.max(...headers.map((column) => column.length)));
  }

  writeHeader(false);
  for (const row of table.rows) {
    const lines = wrap(row, false);
    const length = Math.max(...lines.map((column) => column.length));
    let offset = 0;
    while (offset < length) {
      const available = Math.floor((limit - y - 8) / lineHeight);
      if (available <= 0) {
        writeHeader(true);
        continue;
      }
      const count = Math.min(length - offset, available);
      writeLines(lines, false, offset, count);
      offset += count;
    }
  }
  pdf.end();
  return complete;
}
