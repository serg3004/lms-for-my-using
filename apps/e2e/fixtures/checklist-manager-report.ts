import type { Page } from '@playwright/test';
import type { ManagerChecklistAnalytics, ManagerChecklistAnalyticsEmployeeRow } from '../../web/src/shared/api/manager.js';

export const reportManagerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const reportManagerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const reportDepartment = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const firstEmployee = '11111111-1111-4111-8111-111111111111';
const secondEmployee = '22222222-2222-4222-8222-222222222222';
const options = [{ id: reportManagerA, name: '=Alice Manager' }, { id: reportManagerB, name: 'Bob Manager' }];

export function managerReportFixture(managerId = '', departmentId = ''): ManagerChecklistAnalytics {
  const all: ManagerChecklistAnalyticsEmployeeRow[] = [
    { userId: firstEmployee, firstName: 'Alex', lastName: 'Employee', email: 'alex@example.invalid', department: 'Warehouse', departmentId: reportDepartment, sessionsCount: 2, completedCount: 2, averagePercentage: 60, trend: 'flat', performance: 'mid', lastSessionAt: '2026-01-10T12:00:00Z' },
    { userId: secondEmployee, firstName: 'Mira', lastName: 'Employee', email: 'mira@example.invalid', department: 'Warehouse', departmentId: reportDepartment, sessionsCount: 1, completedCount: 1, averagePercentage: 100, trend: 'up', performance: 'high', lastSessionAt: '2026-01-10T12:00:00Z' },
    { userId: '33333333-3333-4333-8333-333333333333', firstName: 'No', lastName: 'Manager', email: 'unassigned@example.invalid', department: null, departmentId: null, sessionsCount: 0, completedCount: 0, averagePercentage: null, trend: null, performance: null, lastSessionAt: null },
  ];
  const managersOf = (row: ManagerChecklistAnalyticsEmployeeRow): string[] => row.userId === firstEmployee ? [reportManagerA, reportManagerB] : row.userId === secondEmployee ? [reportManagerA] : [];
  const employees = all.filter((row) => (!departmentId || row.departmentId === departmentId) && (!managerId || (managerId === 'unassigned' ? managersOf(row).length === 0 : managersOf(row).includes(managerId))));
  const average = (rows: ManagerChecklistAnalyticsEmployeeRow[]) => {
    const completed = rows.reduce((sum, row) => sum + row.completedCount, 0);
    return completed ? Math.round(rows.reduce((sum, row) => sum + (row.averagePercentage ?? 0) * row.completedCount, 0) / completed) : null;
  };
  const managers = [...options, { id: 'unassigned', name: '' }].flatMap((manager) => {
    if (managerId && manager.id !== managerId) return [];
    const members = employees.filter((row) => manager.id === 'unassigned' ? managersOf(row).length === 0 : managersOf(row).includes(manager.id));
    return members.length ? [{ managerId: manager.id === 'unassigned' ? null : manager.id, name: manager.id === 'unassigned' ? null : manager.name, employeesCount: members.length, completedCount: members.reduce((sum, row) => sum + row.completedCount, 0), averagePercentage: average(members) }] : [];
  });
  const scoredCount = employees.reduce((sum, row) => sum + row.completedCount, 0);
  const departmentEmployees = employees.filter((row) => row.departmentId === reportDepartment);
  return {
    summary: { totalEmployees: employees.length, totalSessions: scoredCount, completedSessions: scoredCount, selfCompletedCount: 0, averagePercentage: average(employees) ?? 0, lowCount: 0, highCount: employees.filter((row) => row.performance === 'high').length, noCompletionCount: employees.filter((row) => row.completedCount === 0).length },
    thresholds: { low: 60, high: 90 },
    distribution: [{ bucket: 'low', count: 0 }, { bucket: 'mid', count: scoredCount ? scoredCount - 1 : 0 }, { bucket: 'high', count: scoredCount ? 1 : 0 }],
    trend: scoredCount ? [{ date: '2026-01-10', averagePercentage: average(employees)!, count: scoredCount }] : [],
    employees, managers, managerOptions: options,
    departmentOptions: [{ id: reportDepartment, name: 'Warehouse' }],
    departments: departmentEmployees.length ? [{ departmentId: reportDepartment, name: 'Warehouse', employeesCount: departmentEmployees.length, sessionsCount: scoredCount, completedCount: scoredCount, averagePercentage: average(departmentEmployees), noCompletionCount: 0 }] : [],
  };
}

export async function installManagerReportMocks(page: Page, role: 'admin' | 'manager') {
  const requests: URL[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', firstName: 'Report', lastName: 'Viewer', email: 'viewer@example.invalid', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklists') return route.fulfill({ json: [] });
    if (path === '/checklists/manager-analytics' || path === '/checklists/manager-analytics/export') {
      requests.push(url);
      const data = managerReportFixture(url.searchParams.get('managerId') ?? '', url.searchParams.get('departmentId') ?? '');
      if (path.endsWith('/export')) {
        const rows = [['Руководитель', 'Сотрудники', 'Завершённые сессии', 'Среднее, %'], ...data.managers.map((row) => [row.name ?? 'Без руководителя', row.employeesCount, row.completedCount, row.averagePercentage ?? ''])];
        const csv = '\uFEFF' + rows.map((row) => row.map((value) => {
          const text = String(value);
          return `"${(/^[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
        }).join(',')).join('\r\n') + '\r\n';
        return route.fulfill({ json: { filename: 'checklist-managers.csv', rows, csv, rowCount: data.managers.length } });
      }
      return route.fulfill({ json: data });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
  });
  return requests;
}
