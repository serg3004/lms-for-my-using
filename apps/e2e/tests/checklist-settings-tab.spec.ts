import { expect, test } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

// PR 435: the editor has two tabs. «Основное» is the sheet itself, «Настройки» holds scoring and every setting of the sheet.
for (const width of [1280, 390, 320]) test(`two tabs: settings are off the main page, Save stays visible, nothing overflows at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openFormattingEditor(page);
  const main = page.getByRole('tab', { name: 'Основное', exact: true });
  const settings = page.getByRole('tab', { name: 'Настройки', exact: true });
  await expect(main).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Порог зачёта, %')).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Нумерация критериев и групп', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect(page.getByText('Все изменения сохранены.')).toBeVisible();

  await settings.click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByLabel('Порог зачёта, %')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Нумерация критериев и групп', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Группы и критерии' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('keyboard: arrows, Home and End switch the tabs; unsaved changes survive the switch; a link with #settings opens the settings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFormattingEditor(page);
  const main = page.getByRole('tab', { name: 'Основное', exact: true });
  const settings = page.getByRole('tab', { name: 'Настройки', exact: true });
  await main.focus();
  await page.keyboard.press('ArrowRight');
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await expect(settings).toBeFocused();
  const threshold = page.getByLabel('Порог зачёта, %');
  await threshold.fill('73');
  await expect(page.locator('.admin-builder-tabbar__status').filter({ hasText: 'Есть несохранённые изменения.' })).toBeVisible();
  await settings.focus();
  await page.keyboard.press('Home');
  await expect(main).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await expect(threshold).toHaveValue('73');
  await expect(page.locator('.admin-builder-tabbar__status').filter({ hasText: 'Есть несохранённые изменения.' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(main).toHaveAttribute('aria-selected', 'true');
  await expect(page).not.toHaveURL(/#settings/);
  await page.evaluate(() => { window.location.hash = '#settings'; });
  await expect(settings).toHaveAttribute('aria-selected', 'true');
});
