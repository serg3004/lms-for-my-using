import { expect, test } from '@playwright/test';

const sheet = (id: string, title: string, status: string, creator: { firstName: string; lastName: string } | null) => ({
  id, organizationId: 'org', title, description: null, status, scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: 'admin', creator: creator && { id: 'admin', ...creator }, createdAt: '2026-10-01T16:47:00.000Z', updatedAt: '2026-10-01T16:47:00.000Z',
  items: [{ id: `${id}-item`, checklistId: id, order: 1, text: 'Criterion', points: 10, isRequired: true, photoRequired: false }],
});

test.describe('Checklist list: author column and bulk actions (PR 393, 394)', () => {
  test('selects checklists, deletes them in bulk and explains the skipped one', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    let deleted = false;
    let bulkBody: unknown = null;
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v1', '');
      if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklists/bulk') {
        bulkBody = request.postDataJSON();
        deleted = true;
        return route.fulfill({ json: { action: 'delete', done: 1, skipped: 1, results: [{ id: 'c1', result: 'done' }, { id: 'c2', result: 'skipped', reason: 'moved_to_draft' }] } });
      }
      if (path === '/checklists') {
        return route.fulfill({ json: deleted ? [sheet('c2', 'Closing shift', 'draft', null), sheet('c3', 'Safety round', 'archived', null)] : [sheet('c1', 'Opening shift', 'published', { firstName: 'Анна', lastName: 'Орлова' }), sheet('c2', 'Closing shift', 'published', null), sheet('c3', 'Safety round', 'archived', null)] });
      }
      return route.fulfill({ json: [] });
    });

    await page.goto('/admin/checklists');
    await expect(page.getByRole('columnheader', { name: 'Создал' })).toBeVisible();
    await expect(page.getByText('Анна Орлова')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Выбрать чек-лист: Opening shift' }).check();
    await page.getByRole('checkbox', { name: 'Выбрать чек-лист: Closing shift' }).check();
    await expect(page.getByText('Выбрано: 2')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Выбрано: 2' }).getByRole('button', { name: 'Редактировать' })).toBeDisabled();

    await page.getByRole('region', { name: 'Выбрано: 2' }).getByRole('button', { name: 'Удалить' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Opening shift');
    await expect(dialog).toContainText('Closing shift');
    await dialog.getByRole('button', { name: 'Удалить' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Готово: 1, пропущено: 1' })).toContainText('Closing shift');
    expect(bulkBody).toEqual({ action: 'delete', ids: ['c1', 'c2'] });
    await expect(page.getByRole('checkbox', { name: 'Выбрать чек-лист: Closing shift' })).not.toBeChecked();
  });
});
