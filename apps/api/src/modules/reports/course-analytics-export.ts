import type { TestResult as CourseTestResult } from './course-analytics.js';
import { exportLocale, type ReportLocale as Locale, type ReportCell } from '../checklists/public.js';

/**
 * PR 475: rows of the course analytics export. The numbers are the ones of the screen (PR 473, 474): this module only
 * names and formats them (labels in the language of the user, time as hh:mm, dates in the user's time zone), it
 * never counts anything itself. The first row is the header; a note on how time is counted closes the table.
 */

export type ExportView = 'courses' | 'course' | 'user';

type CourseUserStatus = 'not_started' | 'in_progress' | 'completed';
type Row = {
  status: CourseUserStatus; lessonsTotal: number; lessonsCompleted: number; lessonsPercent: number; testPercent: number | null; testScore: number | null;
  attempts: number; testResult: CourseTestResult; startedAt: Date | string | null; completedAt: Date | string | null; durationMinutes: number | null;
  dueAt: Date | string | null; overdue: boolean; certificate: { status: 'issued' | 'revoked' } | null;
};
type Summary = {
  assigned: number; started: number; completed: number; completedPercent: number; passed: number; failed: number; overdue: number;
  avgPercent: number | null; medianPercent: number | null; avgDurationMinutes: number | null;
};

const L = {
  status: { not_started: { ru: 'Не начат', en: 'Not started', kk: 'Басталмаған', zh: '未开始' }, in_progress: { ru: 'В процессе', en: 'In progress', kk: 'Орындалуда', zh: '进行中' }, completed: { ru: 'Завершён', en: 'Completed', kk: 'Аяқталған', zh: '已完成' } },
  result: { passed: { ru: 'Сдал', en: 'Passed', kk: 'Тапсырды', zh: '通过' }, failed: { ru: 'Не сдал', en: 'Failed', kk: 'Тапсырмады', zh: '未通过' }, pending: { ru: 'Тест не проходил', en: 'Test not taken', kk: 'Тест тапсырылмаған', zh: '未参加测试' }, no_test: { ru: 'Без теста', en: 'No test', kk: 'Тестсіз', zh: '无测试' } },
  certificate: { issued: { ru: 'Выдан', en: 'Issued', kk: 'Берілген', zh: '已颁发' }, revoked: { ru: 'Отозван', en: 'Revoked', kk: 'Қайтарып алынған', zh: '已撤销' } },
  yes: { ru: 'Да', en: 'Yes', kk: 'Иә', zh: '是' },
  no: { ru: 'Нет', en: 'No', kk: 'Жоқ', zh: '否' },
  note: {
    ru: 'Время — календарное: от первого действия до завершения курса, а не время активного чтения. Результат теста — по лучшей завершённой попытке.',
    en: 'Time is calendar time: from the first action to course completion, not active reading time. The test result is by the best completed attempt.',
    kk: 'Уақыт — күнтізбелік: алғашқы әрекеттен курсты аяқтауға дейін, белсенді оқу уақыты емес. Тест нәтижесі — ең жақсы аяқталған талпыныс бойынша.',
    zh: '时间为日历时间：从首次操作到完成课程，而非实际阅读时间。测试结果按最佳已完成尝试计算。',
  },
} as const;

export const SHEET_NAMES: Record<ExportView, Record<Locale, string>> = {
  courses: { ru: 'Сводка по курсам', en: 'Courses summary', kk: 'Курстар жиыны', zh: '课程汇总' },
  course: { ru: 'По курсу', en: 'By course', kk: 'Курс бойынша', zh: '按课程' },
  user: { ru: 'По пользователю', en: 'By user', kk: 'Пайдаланушы бойынша', zh: '按用户' },
};

const HEADERS = {
  courses: {
    ru: ['Курс', 'Назначено', 'Начали', 'Завершили', 'Завершили, %', 'Сдали', 'Не сдали', 'Просрочено', 'Средний балл, %', 'Медиана баллов, %', 'Среднее время (чч:мм)'],
    en: ['Course', 'Assigned', 'Started', 'Completed', 'Completed, %', 'Passed', 'Failed', 'Overdue', 'Average score, %', 'Median score, %', 'Average time (hh:mm)'],
    kk: ['Курс', 'Тағайындалған', 'Бастады', 'Аяқтады', 'Аяқтады, %', 'Тапсырды', 'Тапсырмады', 'Мерзімі өткен', 'Орташа балл, %', 'Балл медианасы, %', 'Орташа уақыт (сс:мм)'],
    zh: ['课程', '已分配', '已开始', '已完成', '完成率, %', '通过', '未通过', '已逾期', '平均分, %', '分数中位数, %', '平均用时 (时:分)'],
  },
} as const;

const DETAIL_TAIL = {
  ru: ['Статус', 'Уроки пройдено', 'Уроков всего', 'Прохождение, %', 'Тест (сдал / не сдал)', 'Балл теста, %', 'Баллы', 'Попытки', 'Начал', 'Завершил', 'Время (чч:мм)', 'Срок', 'Просрочено', 'Сертификат'],
  en: ['Status', 'Lessons completed', 'Lessons total', 'Progress, %', 'Test (passed / failed)', 'Test score, %', 'Points', 'Attempts', 'Started', 'Completed', 'Time (hh:mm)', 'Due', 'Overdue', 'Certificate'],
  kk: ['Күйі', 'Өтілген сабақтар', 'Барлық сабақ', 'Өту, %', 'Тест (тапсырды / тапсырмады)', 'Тест балы, %', 'Балдар', 'Талпыныстар', 'Бастады', 'Аяқтады', 'Уақыт (сс:мм)', 'Мерзімі', 'Мерзімі өткен', 'Сертификат'],
  zh: ['状态', '已完成课时', '课时总数', '进度, %', '测试 (通过 / 未通过)', '测试分数, %', '得分', '尝试次数', '开始', '完成', '用时 (时:分)', '截止', '逾期', '证书'],
} as const;

const FIRST = {
  course: { ru: ['Сотрудник', 'Email'], en: ['Employee', 'Email'], kk: ['Қызметкер', 'Email'], zh: ['员工', 'Email'] },
  user: { ru: ['Курс'], en: ['Course'], kk: ['Курс'], zh: ['课程'] },
} as const;

const blank = (value: number | null): ReportCell => value ?? '';

/** Minutes as hh:mm (hours may exceed 24); empty when unknown. */
export function formatHoursMinutes(minutes: number | null): string {
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** yyyy-mm-dd hh:mm in the time zone of the user (UTC when the zone is unknown). */
export function formatDateTime(value: Date | string | null, timeZone: string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function detailCells(row: Row, locale: Locale, timeZone: string | null | undefined): ReportCell[] {
  return [
    L.status[row.status][locale], row.lessonsCompleted, row.lessonsTotal, row.lessonsPercent, L.result[row.testResult][locale], blank(row.testPercent), blank(row.testScore), row.attempts,
    formatDateTime(row.startedAt, timeZone), formatDateTime(row.completedAt, timeZone), formatHoursMinutes(row.durationMinutes), formatDateTime(row.dueAt, timeZone),
    row.overdue ? L.yes[locale] : L.no[locale], row.certificate ? L.certificate[row.certificate.status][locale] : '',
  ];
}

const noteRows = (locale: Locale): ReportCell[][] => [[], [L.note[locale]]];

export function coursesExportRows(courses: ReadonlyArray<Summary & { title: string }>, locale: Locale): ReportCell[][] {
  return [
    [...HEADERS.courses[locale]],
    ...courses.map((course) => [course.title, course.assigned, course.started, course.completed, course.completedPercent, course.passed, course.failed, course.overdue, blank(course.avgPercent), blank(course.medianPercent), formatHoursMinutes(course.avgDurationMinutes)]),
    ...noteRows(locale),
  ];
}

export function courseExportRows(rows: ReadonlyArray<Row & { user: { firstName: string; lastName: string; email: string } | null }>, locale: Locale, timeZone: string | null | undefined): ReportCell[][] {
  return [
    [...FIRST.course[locale], ...DETAIL_TAIL[locale]],
    ...rows.map((row) => [row.user ? [row.user.lastName, row.user.firstName].filter(Boolean).join(' ') : '', row.user?.email ?? '', ...detailCells(row, locale, timeZone)]),
    ...noteRows(locale),
  ];
}

export function userExportRows(rows: ReadonlyArray<Row & { courseTitle: string }>, locale: Locale, timeZone: string | null | undefined): ReportCell[][] {
  return [
    [...FIRST.user[locale], ...DETAIL_TAIL[locale]],
    ...rows.map((row) => [row.courseTitle, ...detailCells(row, locale, timeZone)]),
    ...noteRows(locale),
  ];
}

export { exportLocale };
