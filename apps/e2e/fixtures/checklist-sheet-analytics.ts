import type { Page } from '@playwright/test';
import type { ItemAnalytics, ItemAnalyticsMetrics, SheetAnalytics, SheetAnalyticsMetrics, SheetAnalyticsSheet } from '../../web/src/shared/api/manager.js';

export const sheetA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const sheetB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const sheetList: SheetAnalyticsSheet[] = [
  { id: sheetA, title: 'Охрана труда', status: 'published', folderId: null, sessionsInPeriod: 4 },
  { id: sheetB, title: 'Складская приёмка', status: 'published', folderId: null, sessionsInPeriod: 2 },
];

const yesNo = { scaleKey: 'yes_no', kind: 'yes_no' as const, name: null, levels: [{ value: 0, label: null, labelKey: 'no' as const, color: null, count: 2 }, { value: 1, label: null, labelKey: 'yes' as const, color: null, count: 6 }] };
const ownScale = { scaleKey: 'scale:1', kind: 'scale' as const, name: 'Освоение', levels: [{ value: 1, label: 'Не знает', labelKey: null, color: '#dc2626', count: 1 }, { value: 2, label: 'Уверенно', labelKey: null, color: '#0f9f6e', count: 5 }] };

function metrics(planned: number, completed: number, scales: SheetAnalyticsMetrics['scales']): SheetAnalyticsMetrics {
  return {
    plan: { planned, completed, inProgress: 0, notStarted: planned - completed, overdue: 1, remaining: planned - completed },
    completionPercentage: planned ? Math.round((completed / planned) * 100) : null, selfCompleted: 0, averagePercentage: completed ? 81 : null,
    criteria: { total: 12, answered: 8, skipped: 1, remaining: 3, zeroPoints: 2 }, scales, queue: { notStarted: planned - completed, oldestDays: 3 },
  };
}

export function sheetAnalyticsFixture(ids: string[]): SheetAnalytics {
  const rows = [{ checklistId: sheetA, title: 'Охрана труда', ...metrics(4, 3, [yesNo]) }, { checklistId: sheetB, title: 'Складская приёмка', ...metrics(2, 1, [ownScale]) }].filter((row) => ids.length === 0 || ids.includes(row.checklistId));
  const planned = rows.reduce((sum, row) => sum + row.plan.planned, 0);
  const completed = rows.reduce((sum, row) => sum + row.plan.completed, 0);
  return { total: metrics(planned, completed, rows.flatMap((row) => row.scales)), sheets: rows, period: { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, truncated: false };
}

export async function installSheetAnalyticsMocks(page: Page, role: 'admin' | 'manager' | 'instructor', itemRequests: URL[] = []) {
  const requests: URL[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', firstName: 'Sheet', lastName: 'Viewer', email: 'viewer@example.invalid', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklists/analytics/sheets') return route.fulfill({ json: sheetList });
    if (path === '/checklists/analytics/overview') {
      requests.push(url);
      return route.fulfill({ json: sheetAnalyticsFixture((url.searchParams.get('checklistIds') ?? '').split(',').filter(Boolean)) });
    }
    const itemsMatch = /^\/checklists\/([^/]+)\/analytics\/items$/.exec(path);
    if (itemsMatch) {
      itemRequests.push(url);
      if (itemsMatch[1] === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') return route.fulfill({ status: 404, json: { statusCode: 404, message: 'Checklist not found' } });
      return route.fulfill({ json: itemAnalyticsFixture((url.searchParams.get('by') ?? 'criteria') as ItemAnalytics['by'], { plain: itemsMatch[1] === sheetB, noteItem: url.searchParams.get('itemId') }) });
    }
    if (path === '/checklists/manager-analytics') {
      return route.fulfill({ json: { summary: { totalEmployees: 0, totalSessions: 0, completedSessions: 0, selfCompletedCount: 0, averagePercentage: 0, lowCount: 0, highCount: 0, noCompletionCount: 0 }, thresholds: { low: 60, high: 90 }, distribution: [], trend: [], employees: [], departments: [], managers: [], managerOptions: [], departmentOptions: [] } });
    }
    if (path === '/checklists') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
  });
  return requests;
}

// ---- PR 462: one sheet cut by criteria, groups, feedback and notes ----

const levels = (no: number, yes: number) => [{ value: 0, label: null, labelKey: 'no' as const, color: null, count: no }, { value: 1, label: null, labelKey: 'yes' as const, color: null, count: yes }];
const itemMetrics = (total: number, answered: number, skipped: number, scoreSum: number, scoreMax: number, withNote: number, yes: number): ItemAnalyticsMetrics => ({
  total, answered, skipped, remaining: total - answered - skipped,
  completionPercentage: Math.round((answered / total) * 100), averagePercentage: scoreMax ? Math.round((scoreSum / scoreMax) * 100) : null,
  scoreSum, scoreMax, withNote, noteShare: answered ? Math.round((withNote / answered) * 100) : null,
  scales: [{ scaleKey: 'yes_no', kind: 'yes_no', name: null, levels: levels(answered - yes, yes) }],
});

const criteria = [
  { id: 'c1', text: 'Каски надеты', groupId: 'g1', ...itemMetrics(4, 4, 0, 4, 4, 1, 4) },
  { id: 'c2', text: 'Проход свободен', groupId: 'g1', ...itemMetrics(4, 3, 1, 2, 3, 1, 2) },
  { id: 'c3', text: 'Огнетушитель на месте', groupId: null, ...itemMetrics(4, 2, 0, 1, 2, 0, 1) },
];
const note = (itemId: string, itemText: string, comment: string, at: string) => ({ sessionId: `s-${itemId}`, itemId, itemText, comment, reviewComment: null, at, employee: 'Иванов Иван', observer: 'Петров Пётр' });
const notes = [note('c1', 'Каски надеты', 'Одна каска без ремня', '2026-10-20T09:00:00.000Z'), note('c2', 'Проход свободен', 'Коробки у выхода', '2026-10-18T09:00:00.000Z'), note('c1', 'Каски надеты', 'Всё в порядке', '2026-10-10T09:00:00.000Z')];

/** `plain` sheets have no groups and no feedback, so those two cuts must disappear. */
export function itemAnalyticsFixture(by: ItemAnalytics['by'], options: { plain?: boolean; noteItem?: string | null; instances?: number } = {}): ItemAnalytics {
  const base = { by, instances: options.instances ?? 4, period: { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, truncated: false };
  const rows = options.plain ? criteria.map((row) => ({ ...row, groupId: null })) : criteria;
  if (by === 'criteria') return { ...base, criteria: rows };
  if (by === 'groups') {
    return { ...base, groups: options.plain ? [{ id: null, title: null, criteriaCount: 3, ...itemMetrics(12, 9, 1, 7, 9, 2, 7) }] : [{ id: 'g1', title: 'Каски и проходы', criteriaCount: 2, ...itemMetrics(8, 7, 1, 6, 7, 2, 6) }, { id: null, title: null, criteriaCount: 1, ...itemMetrics(4, 2, 0, 1, 2, 0, 1) }] };
  }
  if (by === 'feedback') {
    return { ...base, feedback: options.plain ? [] : [{ id: 'mood', kind: 'choice', title: 'Настроение смены', builtin: null, sessions: 4, filled: 3, notFilled: 1, options: [{ id: 'good', name: 'Хорошее', count: 2 }, { id: 'bad', name: 'Плохое', count: 1 }] }, { id: 'strengths', kind: 'text', title: '', builtin: 'strengths', sessions: 4, filled: 2, notFilled: 2, options: [] }] };
  }
  const shown = options.noteItem ? notes.filter((entry) => entry.itemId === options.noteItem) : notes;
  return { ...base, criteria: criteria.map((row) => ({ id: row.id, text: row.text, answered: row.answered, withNote: row.withNote, noteShare: row.noteShare })), notes: { total: shown.length, page: 1, pageSize: 20, items: shown } };
}
