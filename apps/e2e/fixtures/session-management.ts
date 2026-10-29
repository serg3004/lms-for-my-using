import { expect, type Page } from '@playwright/test';

export type SessionManagementRole = 'instructor' | 'mentor';
export const managementChecklistTitle = 'Открытие смены';
export const managementCriterion = 'Проверить оборудование перед началом работы';
const organizationId = '55555555-5555-4555-8555-555555555555';
const scheduledId = '77777777-7777-4777-8777-777777777777';
const completedId = '88888888-8888-4888-8888-888888888888';
const employee = { id: 'learner-1', firstName: 'Алексей', lastName: 'Сотрудников', email: 'employee@example.invalid', position: 'Специалист' };
const observer = { id: 'observer-1', firstName: 'Ольга', lastName: 'Наблюдатель', email: 'observer@example.invalid', position: 'Инструктор' };
const item = { id: 'item-1', checklistId: 'checklist-1', order: 1, text: managementCriterion, points: 10, isRequired: true, photoRequired: false };
const checklist = {
  id: 'checklist-1', organizationId, title: managementChecklistTitle, description: null,
  status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null,
  requiresReview: false, createdBy: 'author-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [item],
};
const scheduled = {
  id: scheduledId, organizationId, instanceId: 'scheduled-instance', observerId: observer.id,
  status: 'scheduled', version: 1, scheduledAt: '2026-11-10T09:00:00.000Z', durationMinutes: 30,
  startedAt: null, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
  strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  checklist: { id: 'checklist-2', title: 'Проверка безопасности' }, learner: employee, observer,
  result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
};
const completed = {
  ...scheduled, id: completedId, instanceId: 'completed-instance', status: 'completed', version: 3,
  scheduledAt: '2026-01-10T09:00:00.000Z', startedAt: '2026-01-10T09:00:00.000Z',
  checklist: { id: checklist.id, title: managementChecklistTitle },
  strengths: 'Оборудование подготовлено к работе.', developmentAreas: 'Проверять журнал перед сменой.',
  nextSteps: 'Повторить проверку через неделю.',
  result: { instanceStatus: 'completed', percentage: 100, passed: true, scored: true, visible: true },
};

export function managementListPath(role: SessionManagementRole) {
  return role === 'instructor' ? '/instructor/checklists/sessions/all' : '/mentor/sessions';
}

/** Fully mocked reads keep role-shell audits deterministic and independent of shared demo logins. */
export async function installSessionManagementMocks(page: Page, role: SessionManagementRole) {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Read-only quality fixture' } });
    if (path === '/auth/me') return route.fulfill({ json: {
      ...observer, id: 'current-observer', organizationId, roles: [role], status: 'active', locale: 'ru', timezone: 'UTC',
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-sessions/participants') {
      const items = new URL(request.url()).searchParams.get('role') === 'observer' ? [observer] : [employee];
      return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 20 } });
    }
    if (path === '/checklist-sessions') return route.fulfill({ json: { items: [scheduled, completed], total: 2, page: 1, pageSize: 20 } });
    if (path === `/checklist-sessions/${completedId}`) return route.fulfill({ json: completed });
    if (path === `/checklist-sessions/${completedId}/events`) return route.fulfill({ json: [
      { id: 'created-event', organizationId, sessionId: completedId, eventType: 'created', actorUserId: observer.id, metadata: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'completed-event', organizationId, sessionId: completedId, eventType: 'completed', actorUserId: observer.id, metadata: null, createdAt: '2026-01-10T09:30:00.000Z' },
    ] });
    if (path.endsWith('/score-revisions') || path.endsWith('/location')) return route.fulfill({ json: [] });
    if (path === '/checklist-instances/completed-instance') return route.fulfill({ json: {
      id: 'completed-instance', organizationId, checklistId: checklist.id, userId: employee.id, assignedBy: observer.id,
      reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null, status: 'completed', totalScore: 10, maxScore: 10,
      percentage: 100, passed: true, dueAt: null, submittedAt: '2026-01-10T09:25:00.000Z', completedAt: '2026-01-10T09:30:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-10T09:30:00.000Z', checklist,
      results: [{ id: 'result-1', itemId: item.id, answerState: 'answered', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: 'Оборудование готово.', reviewStatus: 'approved', reviewComment: null, reviewedBy: null, reviewedAt: null }],
    } });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
}

export async function openManagementList(page: Page, role: SessionManagementRole) {
  await installSessionManagementMocks(page, role);
  await page.goto(managementListPath(role));
  await expect(page.getByRole('link', { name: managementChecklistTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы сессий' }).getByRole('link', { name: 'Все сессии' })).toHaveAttribute('aria-current', 'page');
}

export async function openManagementEdit(page: Page) {
  await page.getByRole('button', { name: 'Действия', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Изменить время или наблюдателя', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Редактирование сессии', exact: true });
  await expect(dialog.getByLabel('Время проведения', { exact: true })).toHaveValue('2026-11-10T09:00');
  return dialog;
}

export async function openManagementWizard(page: Page) {
  await page.getByRole('button', { name: /Новая сессия/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Новая сессия', exact: true });
  await expect(dialog.getByRole('checkbox', { name: /Алексей Сотрудников/ })).toBeVisible();
  return dialog;
}

export async function openManagementReport(page: Page, role: SessionManagementRole) {
  await page.getByRole('link', { name: managementChecklistTitle, exact: true }).click();
  await expect(page).toHaveURL(`${managementListPath(role)}/${completedId}`);
  await expect(page.getByRole('heading', { level: 1, name: managementChecklistTitle })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.getByText('Оборудование подготовлено к работе.', { exact: true })).toBeVisible();
}
