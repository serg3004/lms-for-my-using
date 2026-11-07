import { expect, type Page } from '@playwright/test';

/** PR 435: the sheet settings live on the «Настройки» tab of the editor. */
export async function openSettingsTab(page: Page) {
  const tab = page.locator('#checklist-tab-settings');
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export async function openMainTab(page: Page) {
  const tab = page.locator('#checklist-tab-main');
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
