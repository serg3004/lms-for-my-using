import { expect, test, type Page } from '@playwright/test';

const organizationId = '55555555-5555-4555-8555-555555555555';
const sessionId = '77777777-7777-4777-8777-777777777777';

function sessionRow() {
  return {
    id: sessionId, organizationId, instanceId: 'instance-1', observerId: 'observer-1', status: 'scheduled', version: 3,
    scheduledAt: '2026-03-08T07:30:00.000Z', durationMinutes: null, startedAt: null, pausedAt: null, locationCapturePolicy: 'off',
    timezone: 'America/New_York', overdue: false, strengths: null, developmentAreas: null, nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Safety training' },
    learner: { id: 'learner-1', firstName: 'Alex', lastName: 'Learner', email: 'alex@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
  };
}

// PR 360б: the instructor and the mentor manage every session of the organization in their own layout.
async function mockApi(page: Page, role: 'instructor' | 'mentor' | 'admin', toConduct: unknown[] = []) {
  const calls = { cancelled: 0, wizardObserverLookups: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: 'observer-9', organizationId, email: `${role}@example.invalid`,
      firstName: 'Test', lastName: 'Observer', middleName: null, position: null, shift: null, phone: null,
      status: 'active', locale: 'en', timezone: 'America/New_York', roles: [role],
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists') return route.fulfill({ json: [] });
    if (path === '/checklist-sessions/participants') {
      calls.wizardObserverLookups++;
      return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } });
    }
    if (path === `/checklist-sessions/${sessionId}/cancel` && request.method() === 'POST') {
      calls.cancelled++;
      return route.fulfill({ json: { ...sessionRow(), status: 'cancelled', version: 4 } });
    }
    if (path === '/checklist-sessions/to-conduct') return route.fulfill({ json: { items: toConduct, page: 1, pageSize: 100, total: toConduct.length } });
    if (path === '/checklist-sessions') {
      const items = calls.cancelled ? [] : [sessionRow()];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  return calls;
}

test.describe('instructor and mentor manage organization sessions (PR 360б)', () => {
  test.use({ timezoneId: 'America/New_York', viewport: { width: 1280, height: 900 } });

  test('the instructor sees every session, cancels one and has no admin-only controls', async ({ page }) => {
    const calls = await mockApi(page, 'instructor');
    await page.goto('/instructor/checklists/sessions/all');
    await expect(page.getByText('Alex Learner').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'All sessions' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Module settings' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Checklist analytics' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open' }).first()).toHaveAttribute('href', `/instructor/checklists/sessions/all/${sessionId}`);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).last().click();
    await expect.poll(() => calls.cancelled).toBe(1);
  });

  test('the mentor opens the same list on its own route', async ({ page }) => {
    await mockApi(page, 'mentor');
    await page.goto('/mentor/sessions');
    await expect(page.getByText('Alex Learner').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open' }).first()).toHaveAttribute('href', `/mentor/sessions/${sessionId}`);
    await expect(page.getByRole('button', { name: 'Module settings' })).toHaveCount(0);
  });

  test('PR 360в: an admin assigned as an observer sees the queue on the sessions page, otherwise nothing extra', async ({ page }) => {
    await mockApi(page, 'admin', [sessionRow()]);
    await page.goto('/admin/checklists/sessions');
    await expect(page.getByRole('heading', { name: 'Sessions to conduct' })).toBeVisible();
  });

  test('PR 360в: an admin without sessions to conduct sees no queue block', async ({ page }) => {
    await mockApi(page, 'admin');
    await page.goto('/admin/checklists/sessions');
    await expect(page.getByText('Alex Learner').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sessions to conduct' })).toHaveCount(0);
  });
});
