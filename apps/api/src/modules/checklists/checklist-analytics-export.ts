import { plainText } from '@lms/shared/rich-text';
import type { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

import type { AuditLogService } from '../audit-log/public.js';
import type { FolderActor } from './checklist-folder-tree.js';
import type { ChecklistItemAnalytics } from './checklist-item-analytics.js';
import type { ChecklistSheetAnalytics } from './checklist-sheet-analytics.js';
import { exportLocale, MAX_EXPORT_ROWS, serializeReportCsv, type Locale, type ReportCell } from './checklist-report-csv.js';
import type { ChecklistAnalyticsExportQuery } from './checklists.schemas.js';

/**
 * PR 463: the export of the "Analytics" tab. It repeats the current view of the screen (the sheets overview, or one
 * sheet cut by criteria, groups, feedback or notes) with the same period, filters, picked rows, search and sorting.
 * Everything comes from the same read operations as the screen (PR 459, 460), so the access rule and the employee
 * scope are the same and the file never holds data the viewer cannot see on screen.
 */

type Metrics = {
  total: number; answered: number; skipped: number; remaining: number;
  completionPercentage: number | null; averagePercentage: number | null;
  scoreSum: number; scoreMax: number; withNote: number; noteShare: number | null;
  scales: ScaleLike[];
};
type ScaleLike = { scaleKey: string; kind: 'yes_no' | 'sheet' | 'scale'; name: string | null; levels: Array<{ value: number; label: string | null; labelKey: 'yes' | 'no' | null; count: number }> };
type CriterionRow = Metrics & { id: string; text: string; groupId: string | null };
type GroupRow = Metrics & { id: string | null; title: string | null; criteriaCount: number };
type ItemRow = CriterionRow | GroupRow;

const T = {
  total: { ru: 'Итого', en: 'Total', kk: 'Жиыны', zh: '合计' },
  guests: { ru: 'Гости (по ссылке или QR)', en: 'Guests (by link or QR)', kk: 'Қонақтар (сілтеме немесе QR арқылы)', zh: '访客（通过链接或二维码）' },
  noGroup: { ru: 'Без группы', en: 'Without a group', kk: 'Топсыз', zh: '未分组' },
  yes: { ru: 'Да', en: 'Yes', kk: 'Иә', zh: '是' },
  no: { ru: 'Нет', en: 'No', kk: 'Жоқ', zh: '否' },
  scaleYesNo: { ru: 'Критерии «Да / Нет»', en: 'Yes / No criteria', kk: '«Иә / Жоқ» өлшемшарттары', zh: '“是 / 否”标准' },
  scaleSheet: { ru: 'Шкала чек-листа', en: 'Scale of the sheet', kk: 'Чек-парақ шкаласы', zh: '检查表量表' },
  text: { ru: 'Текст', en: 'Text', kk: 'Мәтін', zh: '文本' },
  choice: { ru: 'Выбор', en: 'Choice', kk: 'Таңдау', zh: '选择' },
  strengths: { ru: 'Сильные стороны', en: 'Strengths', kk: 'Күшті жақтары', zh: '优势' },
  developmentAreas: { ru: 'Зоны развития', en: 'Development areas', kk: 'Даму бағыттары', zh: '待提升领域' },
  nextSteps: { ru: 'Следующие шаги', en: 'Next steps', kk: 'Келесі қадамдар', zh: '下一步' },
} as const;
const t = (key: keyof typeof T, locale: Locale) => T[key][locale];

const HEADERS = {
  sheets: {
    ru: ['Чек-лист', 'План', 'Факт', 'Просрочено', 'Выполнение, %', 'Средний балл, %', 'Отвечено', 'Всего ответов', 'Не начато'],
    en: ['Checklist', 'Planned', 'Done', 'Overdue', 'Completion, %', 'Average score, %', 'Answered', 'Answers in total', 'Not started'],
    kk: ['Чек-парақ', 'Жоспар', 'Орындалды', 'Мерзімі өткен', 'Орындалуы, %', 'Орташа балл, %', 'Жауап берілген', 'Барлық жауап', 'Басталмаған'],
    zh: ['检查表', '计划', '完成', '逾期', '完成率, %', '平均分, %', '已回答', '回答总数', '未开始'],
  },
  criteria: {
    ru: ['Критерий', 'Группа', 'Выполнение, %', 'Средний балл, %', 'Отвечено', 'Всего', 'Осталось', 'Пропущено', 'С примечанием', 'Доля примечаний, %'],
    en: ['Criterion', 'Group', 'Completion, %', 'Average score, %', 'Answered', 'Total', 'Left', 'Skipped', 'With a note', 'Note share, %'],
    kk: ['Өлшемшарт', 'Топ', 'Орындалуы, %', 'Орташа балл, %', 'Жауап берілген', 'Барлығы', 'Қалды', 'Өткізілген', 'Ескертпемен', 'Ескертпе үлесі, %'],
    zh: ['标准', '分组', '完成率, %', '平均分, %', '已回答', '总数', '剩余', '已跳过', '含备注', '备注占比, %'],
  },
  groups: {
    ru: ['Группа', 'Критериев', 'Выполнение, %', 'Средний балл, %', 'Отвечено', 'Всего', 'Осталось', 'Пропущено', 'С примечанием', 'Доля примечаний, %'],
    en: ['Group', 'Criteria', 'Completion, %', 'Average score, %', 'Answered', 'Total', 'Left', 'Skipped', 'With a note', 'Note share, %'],
    kk: ['Топ', 'Өлшемшарттар', 'Орындалуы, %', 'Орташа балл, %', 'Жауап берілген', 'Барлығы', 'Қалды', 'Өткізілген', 'Ескертпемен', 'Ескертпе үлесі, %'],
    zh: ['分组', '标准数', '完成率, %', '平均分, %', '已回答', '总数', '剩余', '已跳过', '含备注', '备注占比, %'],
  },
  feedback: {
    ru: ['Поле', 'Тип', 'Сессий', 'Заполнено', 'Не заполнено', 'Вариант', 'Ответов'],
    en: ['Field', 'Type', 'Sessions', 'Filled', 'Not filled', 'Option', 'Answers'],
    kk: ['Өріс', 'Түрі', 'Сессиялар', 'Толтырылған', 'Толтырылмаған', 'Нұсқа', 'Жауаптар'],
    zh: ['字段', '类型', '场次', '已填写', '未填写', '选项', '回答数'],
  },
  notes: {
    ru: ['Дата (UTC)', 'Критерий', 'Примечание', 'Примечание проверяющего', 'Сотрудник', 'Наблюдатель'],
    en: ['Date (UTC)', 'Criterion', 'Note', 'Reviewer note', 'Employee', 'Observer'],
    kk: ['Күні (UTC)', 'Өлшемшарт', 'Ескертпе', 'Тексерушінің ескертпесі', 'Қызметкер', 'Бақылаушы'],
    zh: ['日期 (UTC)', '标准', '备注', '审核人备注', '员工', '观察员'],
  },
  levels: {
    ru: ['Шкала', 'Уровень', 'Ответов', 'Доля, %'],
    en: ['Scale', 'Level', 'Answers', 'Share, %'],
    kk: ['Шкала', 'Деңгей', 'Жауаптар', 'Үлесі, %'],
    zh: ['量表', '等级', '回答数', '占比, %'],
  },
} as const;

const blank = (value: number | null): ReportCell => value ?? '';

/** Pure: levels of the scales as a second block under the table (the bars of the screen). */
export function levelRows(scales: readonly ScaleLike[], locale: Locale): ReportCell[][] {
  if (scales.length === 0) return [];
  const rows: ReportCell[][] = [[], [...HEADERS.levels[locale]]];
  for (const scale of scales) {
    const title = scale.kind === 'yes_no' ? t('scaleYesNo', locale) : scale.kind === 'sheet' ? t('scaleSheet', locale) : scale.name ?? '';
    const sum = scale.levels.reduce((total, level) => total + level.count, 0);
    for (const level of scale.levels) {
      const label = level.labelKey === 'yes' ? t('yes', locale) : level.labelKey === 'no' ? t('no', locale) : level.label ?? String(level.value);
      rows.push([title, label, level.count, sum > 0 ? Math.round((level.count / sum) * 100) : 0]);
    }
  }
  return rows;
}

/** Pure: merges the level counts of the same scale across rows. */
export function mergeScales(rows: ReadonlyArray<{ scales: ScaleLike[] }>): ScaleLike[] {
  const merged = new Map<string, ScaleLike>();
  for (const row of rows) {
    for (const scale of row.scales) {
      const target = merged.get(scale.scaleKey) ?? { ...scale, levels: [] };
      for (const level of scale.levels) {
        const same = target.levels.find((entry) => entry.value === level.value && entry.label === level.label);
        if (same) same.count += level.count; else target.levels.push({ ...level });
      }
      merged.set(scale.scaleKey, target);
    }
  }
  return [...merged.values()].map((scale) => ({ ...scale, levels: [...scale.levels].sort((a, b) => a.value - b.value) }));
}

/** Pure: the total over rows from the raw sums (the same rule as on screen), not from rounded percentages. */
export function sumItemRows(rows: readonly ItemRow[]) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const answered = rows.reduce((sum, row) => sum + row.answered, 0);
  const skipped = rows.reduce((sum, row) => sum + row.skipped, 0);
  const scoreSum = rows.reduce((sum, row) => sum + row.scoreSum, 0);
  const scoreMax = rows.reduce((sum, row) => sum + row.scoreMax, 0);
  const withNote = rows.reduce((sum, row) => sum + row.withNote, 0);
  return {
    total, answered, skipped, remaining: Math.max(0, total - answered - skipped),
    completionPercentage: total > 0 ? Math.round((answered / total) * 100) : null,
    averagePercentage: scoreMax > 0 ? Math.round((scoreSum / scoreMax) * 100) : null,
    scoreSum, scoreMax, withNote, noteShare: answered > 0 ? Math.round((withNote / answered) * 100) : null,
    scales: mergeScales(rows),
  };
}

const rowText = (row: ItemRow) => ('text' in row ? plainText(row.text) : row.title ? plainText(row.title) : '');
const rowKey = (row: ItemRow) => row.id ?? '__none__';

/** Pure: picked rows only (empty = all), searched by text, in the order of the screen. */
export function arrangeItemRows<R extends ItemRow>(rows: readonly R[], options: { pick?: readonly string[]; q?: string; sort?: 'order' | 'completion' | 'average' }): R[] {
  const picked = options.pick && options.pick.length > 0 ? rows.filter((row) => options.pick!.includes(rowKey(row))) : [...rows];
  const needle = (options.q ?? '').trim().toLowerCase();
  const found = needle ? picked.filter((row) => rowText(row).toLowerCase().includes(needle)) : picked;
  const sort = options.sort ?? 'order';
  if (sort === 'order') return found;
  const value = (row: R) => (sort === 'completion' ? row.completionPercentage : row.averagePercentage);
  return found.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = value(a.row);
    const right = value(b.row);
    if (left === null && right === null) return a.index - b.index;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right || a.index - b.index;
  }).map((entry) => entry.row);
}

const metricCells = (row: Pick<Metrics, 'completionPercentage' | 'averagePercentage' | 'answered' | 'total' | 'remaining' | 'skipped' | 'withNote' | 'noteShare'>): ReportCell[] => [
  blank(row.completionPercentage), blank(row.averagePercentage), row.answered, row.total, row.remaining, row.skipped, row.withNote, blank(row.noteShare),
];

type SheetsOverview = {
  total: { guests?: { completed: number; averagePercentage: number | null }; scales: ScaleLike[]; plan: { planned: number; completed: number; overdue: number }; completionPercentage: number | null; averagePercentage: number | null; criteria: { total: number; answered: number; skipped: number; remaining: number }; queue: { notStarted: number } };
  sheets: Array<SheetsOverview['total'] & { checklistId: string; title: string }>;
};

/** Pure: the sheets table of the screen, a total row and the level distribution of the total. */
export function sheetsExportRows(data: SheetsOverview, locale: Locale): ReportCell[][] {
  const line = (label: string, row: SheetsOverview['total']): ReportCell[] => [
    label, row.plan.planned, row.plan.completed, row.plan.overdue, blank(row.completionPercentage), blank(row.averagePercentage),
    row.criteria.answered, row.criteria.answered + row.criteria.remaining + row.criteria.skipped, row.queue.notStarted,
  ];
  return [
    [...HEADERS.sheets[locale]],
    ...data.sheets.map((row) => line(plainText(row.title), row)),
    line(t('total', locale), data.total),
    // PR 468: guests (no account) are inside the total; their own line says how many and with what average.
    ...(data.total.guests && data.total.guests.completed > 0
      ? [[t('guests', locale), '', data.total.guests.completed, '', '', blank(data.total.guests.averagePercentage), '', '', ''] as ReportCell[]]
      : []),
    ...levelRows(data.total.scales, locale),
  ];
}

/** Pure: the criteria or groups table of the screen (already picked, searched and sorted), a total row and the levels. */
export function itemsExportRows(view: 'criteria' | 'groups', rows: readonly ItemRow[], groupTitles: ReadonlyMap<string | null, string | null>, locale: Locale): ReportCell[][] {
  const totals = sumItemRows(rows);
  const first = (row: ItemRow): ReportCell[] => {
    if ('text' in row) return [plainText(row.text), row.groupId && groupTitles.get(row.groupId) ? plainText(groupTitles.get(row.groupId)!) : ''];
    return [row.id === null ? t('noGroup', locale) : plainText(row.title ?? ''), row.criteriaCount];
  };
  return [
    [...HEADERS[view][locale]],
    ...rows.map((row) => [...first(row), ...metricCells(row)]),
    [t('total', locale), '', ...metricCells(totals)],
    ...levelRows(totals.scales, locale),
  ];
}

type FeedbackField = { id: string; kind: 'text' | 'choice'; title: string; builtin: string | null; sessions: number; filled: number; notFilled: number; options: Array<{ id: string; name: string; count: number }> };

/** Pure: one row per option for a choice field, one row for a text field. */
export function feedbackExportRows(fields: readonly FeedbackField[], locale: Locale): ReportCell[][] {
  const rows: ReportCell[][] = [[...HEADERS.feedback[locale]]];
  for (const field of fields) {
    const name = field.title ? plainText(field.title) : field.builtin === 'strengths' || field.builtin === 'developmentAreas' || field.builtin === 'nextSteps' ? t(field.builtin, locale) : field.id;
    const head: ReportCell[] = [name, t(field.kind, locale), field.sessions, field.filled, field.notFilled];
    if (field.kind === 'choice' && field.options.length > 0) for (const option of field.options) rows.push([...head, plainText(option.name), option.count]);
    else rows.push([...head, '', '']);
  }
  return rows;
}

type NoteItem = { itemText: string; comment: string | null; reviewComment: string | null; at: string | null; employee: string; observer: string | null };

export function notesExportRows(notes: readonly NoteItem[], locale: Locale): ReportCell[][] {
  return [
    [...HEADERS.notes[locale]],
    ...notes.map((note) => [note.at ? note.at.slice(0, 10) : '', plainText(note.itemText), note.comment ?? '', note.reviewComment ?? '', note.employee, note.observer ?? '']),
  ];
}

type CutResult = { criteria?: unknown; groups?: unknown; feedback?: unknown; notes?: { items: unknown[] } };

/** Plain helper (built in ChecklistsService's constructor body, not injected). */
export class ChecklistAnalyticsExport {
  constructor(
    private readonly sheets: ChecklistSheetAnalytics,
    private readonly items: ChecklistItemAnalytics,
    private readonly auditLog: Pick<AuditLogService, 'record'>,
  ) {}

  async export(organizationId: string, actor: FolderActor & { id: string; locale?: string | null }, userScope: Prisma.UserWhereInput, query: ChecklistAnalyticsExportQuery) {
    const locale = exportLocale(actor.locale);
    const filters = { from: query.from, to: query.to, departmentId: query.departmentId, managerId: query.managerId };
    let table: ReportCell[][];
    // Data rows only: the total row and the level block under the table are not counted.
    let rowCount: number;
    if (query.view === 'sheets') {
      const overview = await this.sheets.overview(organizationId, actor, userScope, { ...filters, checklistIds: query.checklistIds });
      if (overview.sheets.length > MAX_EXPORT_ROWS) throw new BadRequestException(`The export is limited to ${MAX_EXPORT_ROWS} checklists. Narrow the filters.`);
      table = sheetsExportRows(overview as unknown as SheetsOverview, locale);
      rowCount = overview.sheets.length;
    } else {
      const sheetId = query.checklistId!;
      const cut = (by: 'criteria' | 'groups' | 'feedback' | 'notes') => this.items.items(organizationId, actor, userScope, sheetId, { ...filters, by, page: 1, itemId: query.itemId }, { allNotes: true }) as Promise<CutResult>;
      if (query.view === 'criteria' || query.view === 'groups') {
        const [main, groups] = await Promise.all([cut(query.view), query.view === 'criteria' ? cut('groups') : Promise.resolve(null)]);
        const source = (query.view === 'criteria' ? main.criteria : main.groups) as ItemRow[];
        const titles = new Map<string | null, string | null>(((groups?.groups ?? []) as GroupRow[]).map((group) => [group.id, group.title]));
        const rows = arrangeItemRows(source, { pick: query.pick, q: query.q, sort: query.sort });
        table = itemsExportRows(query.view, rows, titles, locale);
        rowCount = rows.length;
      } else if (query.view === 'feedback') {
        table = feedbackExportRows(((await cut('feedback')).feedback ?? []) as FeedbackField[], locale);
        rowCount = table.length - 1;
      } else {
        table = notesExportRows(((await cut('notes')).notes?.items ?? []) as NoteItem[], locale);
        rowCount = table.length - 1;
      }
    }
    if (rowCount > MAX_EXPORT_ROWS) throw new BadRequestException(`The export is limited to ${MAX_EXPORT_ROWS} rows. Narrow the filters.`);
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist_report.exported',
      targetType: 'checklist_report',
      summary: `Exported ${rowCount} rows of the checklist analytics (${query.view}) to ${query.format.toUpperCase()}`,
      // Counts and filter ids only: no names, notes or answers go into the log.
      metadata: { kind: `analytics_${query.view}`, format: query.format, rowCount, filters: { ...filters, checklistId: query.checklistId, checklistIds: query.checklistIds, picked: query.pick?.length ?? 0 } },
    });
    return { filename: `checklist-analytics-${query.view}-${new Date().toISOString().slice(0, 10)}.csv`, csv: serializeReportCsv(table), rows: table, rowCount };
  }
}
