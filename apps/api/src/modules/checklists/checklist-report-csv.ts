// PR 336: CSV for the checklist reports. Values are neutralised against spreadsheet formula
// injection (OWASP "CSV injection"): a cell that starts with = + - @ TAB or CR gets a leading
// apostrophe so Excel/Sheets show it as text instead of evaluating it.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeCsvCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

const UTF8_BOM = String.fromCharCode(0xfeff);

/** RFC-4180 quoting, CRLF rows, UTF-8 BOM so Excel opens Cyrillic/Chinese text correctly. */
export type ReportCell = string | number;
export type ReportFormat = 'csv' | 'xlsx';

export function serializeReportCsv(rows: ReportCell[][]): string {
  const body = rows.map((row) => row.map((cell) => `"${neutralizeCsvCell(String(cell)).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  return `${UTF8_BOM}${body}\r\n`;
}

export const MAX_EXPORT_ROWS = 5000;

type Locale = 'ru' | 'en' | 'kk' | 'zh';
const LOCALES: readonly Locale[] = ['ru', 'en', 'kk', 'zh'];
export function exportLocale(locale: string | null | undefined): Locale {
  const base = (locale ?? '').toLowerCase().slice(0, 2);
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : 'en';
}

export const EXPORT_HEADERS = {
  managers: {
    ru: ['Руководитель', 'Сотрудники', 'Завершённые сессии', 'Среднее, %'],
    en: ['Manager', 'Employees', 'Completed sessions', 'Average, %'],
    kk: ['Басшы', 'Қызметкерлер', 'Аяқталған сессиялар', 'Орташа, %'],
    zh: ['负责人', '员工数', '已完成会话', '平均分, %'],
  },
  employees: {
    ru: ['Сотрудник', 'Подразделение', 'Сессии', 'Среднее, %', 'Динамика'],
    en: ['Employee', 'Department', 'Sessions', 'Average, %', 'Trend'],
    kk: ['Қызметкер', 'Бөлім', 'Сессиялар', 'Орташа, %', 'Динамика'],
    zh: ['员工', '部门', '会话数', '平均分, %', '趋势'],
  },
  sessions: {
    ru: ['Чек-лист', 'Сотрудник', 'Наблюдатель', 'Статус', 'Запланировано (UTC)', 'Часовой пояс', 'Длительность, мин', 'Результат, %'],
    en: ['Checklist', 'Employee', 'Observer', 'Status', 'Scheduled (UTC)', 'Time zone', 'Duration, min', 'Result, %'],
    kk: ['Чек-лист', 'Қызметкер', 'Бақылаушы', 'Мәртебе', 'Жоспарланған (UTC)', 'Уақыт белдеуі', 'Ұзақтығы, мин', 'Нәтиже, %'],
    zh: ['清单', '员工', '观察员', '状态', '计划时间 (UTC)', '时区', '时长, 分钟', '结果, %'],
  },
} as const;

type EmployeeRowLike = {
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  performance: 'low' | 'mid' | 'high' | null;
};

export type EmployeeExportView = {
  q?: string;
  noCompletion?: 'true' | 'false';
  performance?: 'low' | 'high';
  sort?: 'employee' | 'department' | 'sessions' | 'average';
  dir?: 'asc' | 'desc';
};

const employeeName = (row: Pick<EmployeeRowLike, 'firstName' | 'lastName'>) => [row.firstName, row.lastName].filter(Boolean).join(' ');

/** Same search / toggle / sort the dashboard applies client-side, so the file equals what the user sees. */
export function viewEmployees<T extends EmployeeRowLike>(rows: T[], view: EmployeeExportView): T[] {
  const needle = (view.q ?? '').trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    if (view.noCompletion === 'true' && row.completedCount > 0) return false;
    if (view.performance && row.performance !== view.performance) return false;
    if (!needle) return true;
    return [employeeName(row), row.email, row.department ?? ''].some((value) => value.toLocaleLowerCase().includes(needle));
  });
  if (!view.sort) return filtered;
  const factor = view.dir === 'desc' ? -1 : 1;
  const valueOf = (row: T): string | number | null => {
    if (view.sort === 'employee') return employeeName(row).toLocaleLowerCase();
    if (view.sort === 'department') return row.department?.toLocaleLowerCase() ?? null;
    if (view.sort === 'sessions') return row.sessionsCount;
    return row.averagePercentage;
  };
  return [...filtered].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left < right ? -factor : left > right ? factor : 0;
  });
}

const TREND_ARROW = { up: '▲', down: '▼', flat: '▬' } as const;

export function employeeExportRows(rows: EmployeeRowLike[], locale: Locale): ReportCell[][] {
  return [
    [...EXPORT_HEADERS.employees[locale]],
    ...rows.map((row) => [
      employeeName(row),
      row.department ?? '',
      row.sessionsCount,
      row.averagePercentage ?? '',
      row.trend ? TREND_ARROW[row.trend] : '',
    ]),
  ];
}

type SessionRowLike = {
  status: string;
  scheduledAt: Date | string | null;
  timezone: string;
  durationMinutes: number | null;
  checklist: { title: string };
  learner: { firstName: string; lastName: string };
  observer: { firstName: string; lastName: string };
  result: { visible: boolean; scored: boolean | null; percentage: number | null };
};

/** No feedback text, no geolocation, no e-mail: only what the sessions table already shows. */
export function sessionExportRows(rows: SessionRowLike[], locale: Locale): ReportCell[][] {
  return [
    [...EXPORT_HEADERS.sessions[locale]],
    ...rows.map((row) => [
      row.checklist.title,
      employeeName(row.learner),
      employeeName(row.observer),
      row.status,
      row.scheduledAt ? new Date(row.scheduledAt).toISOString() : '',
      row.timezone,
      row.durationMinutes ?? '',
      row.result.visible && row.result.scored && row.result.percentage !== null ? row.result.percentage : '',
    ]),
  ];
}

const NO_MANAGER = { ru: 'Без руководителя', en: 'No manager', kk: 'Басшысы жоқ', zh: '无负责人' } as const;
export function managerExportRows(rows: { managerId: string | null; name: string | null; employeesCount: number; completedCount: number; averagePercentage: number | null }[], locale: Locale): ReportCell[][] {
  return [
    [...EXPORT_HEADERS.managers[locale]],
    ...rows.map((row) => [row.managerId === null ? NO_MANAGER[locale] : row.name || '—', row.employeesCount, row.completedCount, row.averagePercentage ?? '']),
  ];
}
