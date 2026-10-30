import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { exportLocale, MAX_EXPORT_ROWS, type ReportCell } from './checklist-report-csv.js';
import { aggregateReportScores, type ChecklistSessionReport } from './checklist-session-report.js';

export const MAX_SUMMARY_OBSERVATIONS = 50;

type Labels = {
  title: string; sheet: string; actual: string; planned: string; employee: string; observer: string;
  overall: string; observation: string; information: string; department: string; observerDepartment: string;
  evaluated: string; composition: string; general: string; results: string; feedback: string;
  strengths: string; development: string; comment: string; skipped: string; unanswered: string;
  notScored: string; of: string;
};
export const SUMMARY_LABELS: Record<ReturnType<typeof exportLocale>, Labels> = {
  ru: { title: 'Отчёт Сводка по сессии', sheet: 'Лист наблюдения', actual: 'Фактический период', planned: 'Запланированный период', employee: 'Сотрудник', observer: 'Наблюдатель', overall: 'Общий балл', observation: 'Наблюдение', information: 'Информация по наблюдению', department: 'Подразделение сотрудника', observerDepartment: 'Подразделение наблюдателя', evaluated: 'Дата оценки', composition: 'Состав группы', general: 'Общая информация', results: 'Результаты сессии', feedback: 'Обратная связь', strengths: 'Сильные стороны', development: 'Зоны развития', comment: 'Комментарий', skipped: 'Пропущено', unanswered: 'Нет ответа', notScored: 'Без оценки', of: 'из' },
  en: { title: 'Session summary report', sheet: 'Observation sheet', actual: 'Actual period', planned: 'Scheduled period', employee: 'Employee', observer: 'Observer', overall: 'Overall score', observation: 'Observation', information: 'Observation information', department: 'Employee department', observerDepartment: 'Observer department', evaluated: 'Assessment date', composition: 'Group members', general: 'General information', results: 'Session results', feedback: 'Feedback', strengths: 'Strengths', development: 'Development areas', comment: 'Comment', skipped: 'Skipped', unanswered: 'Unanswered', notScored: 'Not scored', of: 'of' },
  kk: { title: 'Сессияның жиынтық есебі', sheet: 'Бақылау парағы', actual: 'Нақты кезең', planned: 'Жоспарланған кезең', employee: 'Қызметкер', observer: 'Бақылаушы', overall: 'Жалпы ұпай', observation: 'Бақылау', information: 'Бақылау туралы ақпарат', department: 'Қызметкердің бөлімшесі', observerDepartment: 'Бақылаушының бөлімшесі', evaluated: 'Бағалау күні', composition: 'Топ құрамы', general: 'Жалпы ақпарат', results: 'Сессия нәтижелері', feedback: 'Кері байланыс', strengths: 'Күшті жақтар', development: 'Даму аймақтары', comment: 'Түсініктеме', skipped: 'Өткізілді', unanswered: 'Жауап жоқ', notScored: 'Бағаланбаған', of: '/' },
  zh: { title: '会话汇总报告', sheet: '观察表', actual: '实际期间', planned: '计划期间', employee: '员工', observer: '观察员', overall: '总分', observation: '观察', information: '观察信息', department: '员工部门', observerDepartment: '观察员部门', evaluated: '评估日期', composition: '小组成员', general: '基本信息', results: '会话结果', feedback: '反馈', strengths: '优势', development: '改进领域', comment: '备注', skipped: '已跳过', unanswered: '未回答', notScored: '未评分', of: '/' },
};

type VisibleReport = Extract<ChecklistSessionReport, { visible: true }>;
export type SummaryLayout = {
  sheetName: string; headerRows: number[]; columnWidths: number[]; freezeRows: number;
  merges: { startRow: number; startColumn: number; endRow: number; endColumn: number }[];
};

const name = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim();
const observationTime = (report: VisibleReport) => report.header.startedAt ?? report.header.completedAt ?? report.header.scheduledStart;

/** Pure presentation of server-built reports. Compatible snapshots share columns; changed sheet
 * structure and different employees get separate blocks rather than mixing unlike criteria. */
export function buildSessionSummary(reports: ChecklistSessionReport[], locale: ReturnType<typeof exportLocale>) {
  if (!reports.length || reports.length > MAX_SUMMARY_OBSERVATIONS) throw new BadRequestException('session_summary.observation_limit');
  const visible: VisibleReport[] = [];
  let inputRows = 0;
  for (const report of reports) {
    if (!report.visible) throw new ForbiddenException('session_summary.hidden');
    if (report.header.status !== 'completed') throw new BadRequestException('session_summary.completed_only');
    inputRows += report.criteria.length + report.groups.length + report.generalInfo.length;
    if (inputRows > MAX_EXPORT_ROWS) throw new BadRequestException('session_summary.row_limit');
    visible.push(report);
  }
  if (new Set(visible.map((report) => report.checklist.id)).size !== 1) throw new BadRequestException('session_summary.one_checklist');
  const label = SUMMARY_LABELS[locale];
  const formatDate = (date: Date | null, timezone = 'UTC') => date
    ? `${new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(date)} (${timezone})` : '—';
  const percent = (value: number | null) => value === null ? label.notScored : `${value}%`;
  const points = (score: number, max: number) => `${score} ${label.of} ${max}`;
  const scored = (score: number, max: number, percentage: number | null) => `${percent(percentage)} · ${points(score, max)}`;
  const period = (dates: (Date | null)[]) => {
    const sorted = dates.filter((date): date is Date => date !== null).sort((a, b) => a.getTime() - b.getTime());
    return sorted.length ? `${formatDate(sorted[0]!)} — ${formatDate(sorted.at(-1)!)}` : '—';
  };
  const blocks = new Map<string, VisibleReport[]>();
  visible.sort((a, b) => (observationTime(a)?.getTime() ?? 0) - (observationTime(b)?.getTime() ?? 0) || a.sessionId.localeCompare(b.sessionId));
  for (const report of visible) {
    const shape = JSON.stringify({
      learner: report.header.learner.id, title: report.checklist.title, formula: report.summary.formula,
      groups: report.groups.map(({ id, title, number }) => ({ id, title, number })),
      criteria: report.criteria.map(({ id, text, number, groupId }) => ({ id, text, number, groupId })),
      generalInfo: report.generalInfo.map(({ id, label, type }) => ({ id, label, type })),
    });
    const list = blocks.get(shape) ?? []; list.push(report); blocks.set(shape, list);
  }
  const rows: ReportCell[][] = [];
  const layout: SummaryLayout = { sheetName: 'Worksheet 1', headerRows: [], columnWidths: [45, 16, 16], freezeRows: 9, merges: [] };
  const append = (cells: ReportCell[]) => {
    if (rows.length >= MAX_EXPORT_ROWS) throw new BadRequestException('session_summary.row_limit');
    rows.push(cells); return rows.length;
  };
  const merge = (row: number, startColumn: number, endColumn: number) => layout.merges.push({ startRow: row, startColumn, endRow: row, endColumn });
  for (const observations of blocks.values()) {
    if (rows.length) { append([]); append([]); }
    const first = observations[0]!;
    const columns = 3 + observations.length;
    while (layout.columnWidths.length < columns) layout.columnWidths.push(16);
    append([]);
    const titleRow = append([label.title]); merge(titleRow, 1, columns); layout.headerRows.push(titleRow);
    for (const [caption, value] of [
      [label.sheet, first.checklist.title],
      [label.actual, period(observations.flatMap((report) => [report.header.startedAt, report.header.completedAt]))],
      [label.planned, period(observations.flatMap((report) => [report.header.scheduledStart, report.header.scheduledEnd]))],
      [label.employee, name(first.header.learner)],
      [label.observer, [...new Set(observations.map((report) => name(report.header.observer)))].join('; ')],
    ]) { const row = append([caption!, value!]); merge(row, 2, columns); }
    append([]);
    const aggregate = aggregateReportScores(observations.map((report) => report.summary.scored ? { score: report.summary.totalScore, maxScore: report.summary.maxScore, percentage: report.summary.percentage } : null));
    const header = append([label.overall, scored(aggregate.score, aggregate.maxScore, aggregate.percentage), '',
      ...observations.map((report, index) => `${label.observation} ${index + 1}, ${formatDate(observationTime(report), report.header.timezone)}`)]);
    merge(header, 2, 3); layout.headerRows.push(header);
    const section = (caption: string) => { const row = append([caption]); merge(row, 1, columns); layout.headerRows.push(row); };
    const detail = (caption: string, values: ReportCell[]) => append([caption, '', '', ...values]);
    section(label.information);
    detail(label.department, observations.map((report) => report.header.learner.department?.name ?? '—'));
    detail(label.observer, observations.map((report) => name(report.header.observer)));
    detail(label.observerDepartment, observations.map((report) => report.header.observer.department?.name ?? '—'));
    detail(label.evaluated, observations.map((report) => formatDate(report.header.completedAt ?? report.header.startedAt, report.header.timezone)));
    detail(label.composition, observations.map((report) => name(report.header.learner)));
    if (first.generalInfo.length) {
      section(label.general);
      for (const field of first.generalInfo) detail(field.label, observations.map((report) => report.generalInfo.find(({ id }) => id === field.id)?.value ?? '—'));
    }
    const scoreRow = (caption: string, values: Array<{ score: number; maxScore: number; percentage?: number | null } | null>, details?: string[]) => {
      const total = aggregateReportScores(values);
      return append([caption, percent(total.percentage), points(total.score, total.maxScore), ...values.map((value, index) => value
        ? `${scored(value.score, value.maxScore, value.percentage === undefined ? aggregateReportScores([value]).percentage : value.percentage)}${details?.[index] ? `\n${details[index]}` : ''}`
        : details?.[index] || label.notScored)]);
    };
    layout.headerRows.push(scoreRow(label.results, observations.map((report) => report.summary.scored
      ? { score: report.summary.totalScore, maxScore: report.summary.maxScore, percentage: report.summary.percentage } : null)));
    let previousGroup: string | null | undefined;
    for (const criterion of first.criteria) {
      if (criterion.groupId !== previousGroup) {
        previousGroup = criterion.groupId;
        const group = first.groups.find(({ id }) => id === criterion.groupId);
        if (group) layout.headerRows.push(scoreRow(`${group.number} ${group.title}`, observations.map((report) => report.groups.find(({ id }) => id === group.id) ?? null)));
      }
      scoreRow(`${criterion.number} ${criterion.text}`, observations.map((report) => {
        const row = report.criteria.find(({ id }) => id === criterion.id);
        return row && row.score !== null && row.maxScore !== null ? { score: row.score, maxScore: row.maxScore } : null;
      }), observations.map((report) => {
        const row = report.criteria.find(({ id }) => id === criterion.id)!;
        return [row.state === 'skipped' ? label.skipped : row.state === 'unanswered' ? label.unanswered : '', row.levelLabel, row.comment].filter(Boolean).join('\n');
      }));
    }
    if (observations.some((report) => report.feedback)) {
      section(label.feedback);
      detail(label.strengths, observations.map((report) => report.feedback?.strengths ?? '—'));
      detail(label.development, observations.map((report) => report.feedback?.developmentAreas ?? '—'));
      detail(label.comment, observations.map((report) => report.feedback?.comment ?? '—'));
    }
  }
  return { rows: rows.map((row) => Array.from({ length: layout.columnWidths.length }, (_, column) => row[column] ?? '')), layout, sessionIds: visible.map((report) => report.sessionId), rowCount: rows.length };
}
