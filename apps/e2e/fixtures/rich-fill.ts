import type { Locator, Page } from '@playwright/test';

/**
 * PR 428: fill-in fields are contenteditable (TipTap). `fill()` races ProseMirror's selection sync,
 * so select everything and type, the way a person does.
 */
export async function fillRich(page: Page, field: Locator, text: string) {
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await (text ? page.keyboard.type(text) : page.keyboard.press('Backspace'));
}
