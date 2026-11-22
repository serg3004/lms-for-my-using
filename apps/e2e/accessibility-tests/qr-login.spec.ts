import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installQrMocks, newQrState, qrCode } from '../fixtures/qr-login.js';

for (const width of [375, 1440]) {
  test(`the QR sign-in tab is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installQrMocks(page, newQrState());
    await page.goto('/login');
    await page.getByRole('button', { name: 'По QR', exact: true }).click();
    await expect(page.getByRole('img', { name: 'QR-код для входа' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test(`the confirmation page on a phone is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await installQrMocks(page, newQrState());
    await page.goto(`/qr-login#${qrCode}`);
    await expect(page.getByRole('button', { name: 'Подтвердить вход' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
