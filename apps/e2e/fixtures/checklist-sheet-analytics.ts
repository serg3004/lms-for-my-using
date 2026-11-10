import type { Page } from '@playwright/test';
import type { SheetAnalytics, SheetAnalyticsMetrics, SheetAnalyticsSheet } from '../../web/src/shared/api/manager.js';

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

export async function installSheetAnalyticsMocks(page: Page, role: 'admin' | 'manager' | 'instructor') {
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
    if (path === '/checklists/manager-analytics') {
      return route.fulfill({ json: { summary: { totalEmployees: 0, totalSessions: 0, completedSessions: 0, selfCompletedCount: 0, averagePercentage: 0, lowCount: 0, highCount: 0, noCompletionCount: 0 }, thresholds: { low: 60, high: 90 }, distribution: [], trend: [], employees: [], departments: [], managers: [], managerOptions: [], departmentOptions: [] } });
    }
    if (path === '/checklists') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
  });
  return requests;
}
