import { expect, test } from '@playwright/test';
import { openLongreadEntrypoints } from '../fixtures/longread-entrypoints.js';
import { longreadCourseId, longreadLessonId } from '../fixtures/longread-editor.js';

const setting = 'Лонгрид-уроки включены для организации';

test('Activity stays visible in the sidebar and opens the lesson form', async ({ page }) => {
  await openLongreadEntrypoints(page);
  await page.locator('.admin-nav').getByRole('link', { name: 'Задание', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/lessons$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Задание', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: setting }).check();
  await page.getByRole('button', { name: 'Создать задание', exact: false }).click();
  await page.getByRole('dialog').getByLabel('Тип', { exact: true }).selectOption('longread');
});

test('Courses enables longreads for the organization and creates a draft inside a course', async ({ page }) => {
  const server = await openLongreadEntrypoints(page);
  await page.getByRole('checkbox', { name: setting }).check();
  await expect.poll(() => server.changes).toEqual([true]);
  await page.getByRole('link', { name: 'Безопасность', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: setting })).toBeChecked();
  await page.getByRole('button', { name: 'Добавить лонгрид', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: 'Лонгрид', exact: true })).toBeChecked();
  await dialog.getByLabel(/^Название урока/).fill('Безопасная работа');
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/lessons/${longreadLessonId}/longread$`));
  expect(server.writes).toEqual([expect.objectContaining({ type: 'longread', status: 'draft', organizationId: 'org' })]);
  expect(server.writes[0]!.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  await expect(page.getByRole('button', { name: 'Предпросмотр', exact: true })).toBeVisible();
});

test('the course setting preserves unsaved course edits and opens existing longreads', async ({ page }) => {
  const server = await openLongreadEntrypoints(page, { path: `/admin/courses/${longreadCourseId}` });
  await expect(page.getByRole('button', { name: 'Добавить лонгрид', exact: false })).toHaveCount(0);
  await page.getByLabel(/^Название курса/).fill('Мои несохранённые изменения');
  await page.getByRole('checkbox', { name: setting }).check();
  await expect.poll(() => server.changes).toEqual([true]);
  await expect(page.getByRole('link', { name: 'Открыть редактор лонгрида' })).toBeVisible();
  await expect(page.getByLabel(/^Название курса/)).toHaveValue('Мои несохранённые изменения');
  await page.getByRole('checkbox', { name: setting }).uncheck();
  await expect(page.getByRole('link', { name: 'Открыть редактор лонгрида' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: setting }).check();
  await page.getByRole('link', { name: 'Открыть редактор лонгрида' }).click();
  await expect(page.locator('.lr-editor')).toBeVisible();
});

test('setting errors are visible, preserve the saved state and can be retried', async ({ page }) => {
  const server = await openLongreadEntrypoints(page);
  server.failSave();
  await page.getByRole('checkbox', { name: setting }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить настройку');
  await expect(page.getByRole('checkbox', { name: setting })).not.toBeChecked();
  await page.getByRole('checkbox', { name: setting }).check();
  await expect.poll(() => server.changes).toEqual([true]);
  server.failRead(); await page.reload();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить настройку');
  server.recoverRead();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: setting })).toBeChecked();
});

test('managers cannot change the organization setting', async ({ page }) => {
  const server = await openLongreadEntrypoints(page, { role: 'manager' });
  await expect(page.getByRole('heading', { level: 1, name: 'Курсы', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: setting })).toHaveCount(0);
  expect(server.changes).toEqual([]);
});

for (const [locale, label, add] of [['en', 'Activity', 'Add longread'], ['kk', 'Іс-әрекет', 'Лонгрид қосу'], ['zh', '活动', '添加长文阅读']] as const) {
  test(`course entrypoints use ${locale} labels`, async ({ page }) => {
    await openLongreadEntrypoints(page, { locale, enabled: true, path: `/admin/courses/${longreadCourseId}` });
    await expect(page.locator('.admin-nav').getByRole('link', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: add, exact: false })).toBeVisible();
  });
}

for (const width of [320, 375]) test(`the mobile menu keeps Activity and the course fits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openLongreadEntrypoints(page, { enabled: true, path: `/admin/courses/${longreadCourseId}` });
  await expect(page.getByRole('button', { name: 'Добавить лонгрид', exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const clipped = await page.locator('.edit-layout .ds-card, .lesson-row, .lesson-row__actions').evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth;
  }).map((element) => element.className));
  expect(clipped).toEqual([]);
  expect(await page.locator('.lesson-row__title').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(60);
  await page.getByRole('button', { name: 'Открыть навигацию', exact: true }).click();
  await page.locator('.admin-nav').getByRole('link', { name: 'Задание', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Задание', exact: true, level: 1 })).toBeVisible();
});
